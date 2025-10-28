#!/usr/bin/env node

import {run} from './index.js'

function getMillisecondsUntil137PM() {
  const now = new Date()
  const target = new Date()

  // Set target to 1:37 PM today
  target.setHours(13, 37, 0, 0)

  // If it's already past 1:37 PM today, schedule for tomorrow
  if (now > target) {
    target.setDate(target.getDate() + 1)
  }

  return target.getTime() - now.getTime()
}

function scheduleNextRun() {
  const msUntilRun = getMillisecondsUntil137PM()
  const nextRunTime = new Date(Date.now() + msUntilRun)

  console.log(`Next run scheduled for: ${nextRunTime.toLocaleString()}`)

  setTimeout(() => {
    console.log(`Running at ${new Date().toLocaleString()}`)
    run()
      .then(() => {
        console.log('Run completed, scheduling next run...')
        scheduleNextRun()
      })
      .catch((error) => {
        console.error('Run failed:', error)
        console.log('Scheduling next run anyway...')
        scheduleNextRun()
      })
  }, msUntilRun)
}

console.log('Starting cron scheduler for daily runs at 1:37 PM...')
scheduleNextRun()

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, exiting gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, exiting gracefully...')
  process.exit(0)
})
