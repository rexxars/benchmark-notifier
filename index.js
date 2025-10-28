#!/usr/bin/env node

import {readFile, writeFile} from 'fs/promises'
import {chromium} from 'playwright'
import {join as joinPath} from 'node:path'

const TOAST_URL =
  'https://order.toasttab.com/online/benchmark-pizzeria-kensington'

const DATA_FILE =
  process.env.PIZZA_DATA_FILE || joinPath(import.meta.dirname, 'data.json')

const list = new Intl.ListFormat('en', {style: 'long', type: 'conjunction'})

// Home Assistant configuration from environment
const HA_URL = process.env.HA_URL
const HA_TOKEN = process.env.HA_TOKEN

async function fetchMenuData() {
  console.log('Fetching menu data with Playwright...')

  const headless = !process.argv.includes('--no-headless')
  console.log(`Running browser in ${headless ? 'headless' : 'headed'} mode`)

  let browser = null
  try {
    browser = await chromium.launch({headless})
    const page = await browser.newPage()

    // Set a realistic user agent and viewport
    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    await page.setViewportSize({width: 1366, height: 768})

    // Navigate to the page
    await page.goto(TOAST_URL, {waitUntil: 'domcontentloaded'})

    // Wait for the menu content to load
    await page.waitForSelector('#footer', {timeout: 30000})

    const html = await page.content()
    return html
  } catch (error) {
    console.error('Playwright failed:', error)
    throw error
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

function extractPizzaData(html) {
  console.log('Extracting pizza data from HTML...')

  // Look for the script tag containing the OO state data (which has the menu data)
  const ooStateMatch = html.match(/window\.__OO_STATE__\s*=\s*({[\s\S]*?});/)

  if (!ooStateMatch) {
    throw new Error('Could not find OO state script in HTML')
  }

  let ooState
  try {
    // The OO state uses JavaScript object syntax, not strict JSON
    // We'll use eval in a controlled way since it's from a trusted source
    ooState = eval('(' + ooStateMatch[1] + ')')
  } catch (evalError) {
    console.error('Error parsing OO state:', evalError)
    throw new Error('Could not parse OO state data')
  }

  // Navigate through the OO state to find menu items
  const pizzas = []

  // Look through all the Menu objects in the OO state
  for (const [key, value] of Object.entries(ooState)) {
    if (key.startsWith('Menu:') && value.__typename === 'Menu') {
      if (value.groups && Array.isArray(value.groups)) {
        for (const group of value.groups) {
          if (
            group.name.toLowerCase() === 'pizza' &&
            Array.isArray(group.items)
          ) {
            for (const item of group.items) {
              pizzas.push({
                name: item.name,
                description: item.description,
                imageUrl: item.imageUrls?.xl || null,
              })
            }
          }
        }
      }
    }
  }

  // Sort by name
  pizzas.sort((a, b) => a.name.localeCompare(b.name))

  console.log(`Found ${pizzas.length} pizzas`)
  return pizzas
}

async function loadPreviousData() {
  try {
    const data = await readFile(DATA_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No previous data file found, treating as first run')
      return []
    }
    throw error
  }
}

async function savePizzaData(pizzas) {
  await writeFile(DATA_FILE, JSON.stringify(pizzas, null, 2))
  console.log(`Saved ${pizzas.length} pizzas to ${DATA_FILE}`)
}

function compareMenus(oldPizzas, newPizzas) {
  const oldNames = new Set(oldPizzas.map((p) => p.name))
  const newNames = new Set(newPizzas.map((p) => p.name))

  const added = newPizzas.filter((p) => !oldNames.has(p.name))
  const removed = oldPizzas.filter((p) => !newNames.has(p.name))

  return {added, removed}
}

function formatNotificationMessage(added, removed) {
  let message = ''

  if (added.length > 0) {
    message += 'IN: '
    message += list.format(added.map((pizza) => pizza.name))
  }

  if (added.length > 0 && removed.length > 0) {
    message += '\n'
  }

  if (removed.length > 0) {
    message += 'OUT: '
    message += list.format(removed.map((pizza) => pizza.name))
  }

  return message.trim()
}

function getNotificationImage(added, removed) {
  // Use first new pizza image, or first removed pizza image if no new ones
  if (added.length > 0 && added[0].imageUrl) {
    return added[0].imageUrl
  }
  if (removed.length > 0 && removed[0].imageUrl) {
    return removed[0].imageUrl
  }
  return null
}

async function sendNotification(message, imageUrl) {
  if (!HA_URL || !HA_TOKEN) {
    console.log(
      'Home Assistant URL or token not configured, skipping notification',
    )
    console.log('Notification would have been:')
    console.log('Title: Benchmark pizza menu changed!')
    console.log('Message:', message)
    if (imageUrl) console.log('Image:', imageUrl)
    return
  }

  try {
    const payload = {
      message,
      title: 'Benchmark pizza menu changed!',
      data: {url: TOAST_URL, clickAction: TOAST_URL},
    }

    if (imageUrl) {
      payload.data.image = imageUrl
    }

    const response = await fetch(`${HA_URL}/api/services/notify/all_phones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      if (response.headers.get('content-type')?.includes('application/json')) {
        const errorData = await response.json()
        console.error('Home Assistant error response:', errorData)
      } else {
        const errorText = await response.text()
        console.error('Home Assistant error response:', errorText)
      }

      throw new Error(
        `HTTP error! status: ${response.status} ${response.statusText}`,
      )
    }

    console.log('Notification sent successfully')
  } catch (error) {
    console.error('Error sending notification:', error)
    throw error
  }
}

export async function run() {
  try {
    const html = await fetchMenuData()
    const currentPizzas = extractPizzaData(html)

    // Load previous data
    const previousPizzas = await loadPreviousData()

    // Compare menus
    const {added, removed} = compareMenus(previousPizzas, currentPizzas)

    if (added.length > 0 || removed.length > 0) {
      console.log(
        `Menu changes detected: ${added.length} added, ${removed.length} removed`,
      )

      const message = formatNotificationMessage(added, removed)
      const imageUrl = getNotificationImage(added, removed)

      await sendNotification(message, imageUrl)
    } else {
      console.log('No menu changes detected')
    }

    // Save current data for next run
    await savePizzaData(currentPizzas)
  } catch (error) {
    console.error('Error running pizza notifier:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  run()
}
