import assert from 'node:assert/strict'
import { meetingDue, capDecision } from '../shared/team-meeting.ts'
const now = 1_800_000_000_000
assert.equal(meetingDue(now - 299_999, now), false)
assert.equal(meetingDue(now - 300_000, now), true)
assert.equal(meetingDue(0, now), true)
assert.equal(meetingDue(now + 1000, now), false)
assert.equal(capDecision(null, 2, false, false, 0, now), 'DERISK')
assert.equal(capDecision(null, 1, true, true, 0, now), 'HOLD')
assert.equal(capDecision(0.5, 0, true, true, now - 86_400_000, now), 'RESTORE')
assert.equal(capDecision(0.5, 1, true, true, now - 86_400_000, now), 'HOLD')
assert.equal(capDecision(0.5, 0, true, false, now - 86_400_000, now), 'HOLD')
assert.equal(capDecision(0.5, 0, true, true, 0, now), 'HOLD')
assert.equal(capDecision(0.5, 0, true, true, now - 86_399_999, now), 'HOLD')
console.log('11 team review cadence and cap checks passed')
