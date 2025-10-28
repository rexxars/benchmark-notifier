#!/usr/bin/env node

import {run} from './index.js'

function getMillisecondsUntil137PM() {
  const now = new Date()

  // Create target time in PST (UTC-8)
  const target = new Date()
  target.setUTCHours(21, 37, 0, 0) // 13:37 PST = 21:37 UTC

  // If it's already past the target time today, schedule for tomorrow
  if (now > target) {
    target.setUTCDate(target.getUTCDate() + 1)
  }

  return target.getTime() - now.getTime()
}

function scheduleNextRun() {
  const msUntilRun = getMillisecondsUntil137PM()
  const nextRunTime = new Date(Date.now() + msUntilRun)

  console.log(
    `Next run scheduled for: ${nextRunTime.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})} PST`,
  )

  setTimeout(() => {
    console.log(
      `Running at ${new Date().toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})} PST`,
    )
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
