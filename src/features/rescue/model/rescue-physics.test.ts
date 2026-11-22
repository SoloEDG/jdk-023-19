import { describe, expect, it } from 'vitest'
import { createDocument, type PinballDocument } from '@/shared/document'
import { collectSolids } from '@/features/table/lib/solids'
import { createMechanisms } from '@/features/table/model/mechanism-rules'
import { advanceBall } from '@/features/scoring/model/ball-step'
import { sampleRamp, sampleScoop } from '@/features/table/lib/playfield-layout'
import { KICKBACK_SPEED_CAP } from '@/features/rescue/model/rescue-config'
import { resolveDrain, startSaver } from '@/features/rescue/model/rescue-rules'
import { speedOf } from '@/shared/geometry'
import { commitSession } from '@/features/records/model/history-store'

function playingDoc(): PinballDocument {
  const d = createDocument()
  d.mechanisms = createMechanisms()
  d.phase = 'playing'
  d.run.launched = true
  return d
}

describe('踢回物理边界', () => {
  it('踢回后连续模拟，球始终在台面边界内，且会回到台面上方', () => {
    const d = playingDoc()
    startSaver(d)
    d.ball.held = 'none'
    d.ball.x = 330
    d.ball.y = 760
    d.ball.vy = 300
    d.rescue.laneRoute = 'right'
    const rescued = resolveDrain(d)
    expect(rescued).toBe(true)

    // 踢回瞬间的初速严格封顶（这是"力道不能把球推出边界"的约束点）
    expect(speedOf(d.ball.vx, d.ball.vy)).toBeLessThanOrEqual(KICKBACK_SPEED_CAP + 1e-9)

    const solids = collectSolids(d)
    let minY = Infinity
    for (let frame = 0; frame < 8 * 60; frame += 1) {
      advanceBall(d, solids, 16, { ramp: sampleRamp, scoop: sampleScoop })
      if (!d.ball) break
      minY = Math.min(minY, d.ball.y)
      // 硬边界：任何一帧都不得越出画布（后续弹射加速由全局 MAX_SPEED 约束）
      expect(d.ball.x - d.ball.radius).toBeGreaterThanOrEqual(-30)
      expect(d.ball.x + d.ball.radius).toBeLessThanOrEqual(430)
      expect(d.ball.y - d.ball.radius).toBeGreaterThanOrEqual(0)
      if (d.signals.drain) break
    }
    // 踢回把球送到了挡板上方的台面安全区
    expect(minY).toBeLessThan(560)
  })
})

describe('救援记录与破万', () => {
  it('历史记录包含救援次数，但 score 不含救援，破万只由真实得分推进', () => {
    const d = playingDoc()
    startSaver(d)
    // 两次中路球保
    for (let i = 0; i < 2; i += 1) {
      d.ball.held = 'none'
      d.ball.x = 200
      d.ball.y = 760
      d.ball.vy = 300
      d.rescue.graceMs = 0
      resolveDrain(d)
    }
    // 一次左踢回
    d.ball.held = 'none'
    d.ball.x = 60
    d.ball.y = 760
    d.ball.vy = 300
    d.rescue.laneRoute = 'left'
    d.rescue.graceMs = 0
    resolveDrain(d)

    const scoreAfterRescue = d.score
    expect(scoreAfterRescue).toBe(0)

    // 真实得分才推进破万
    d.score = 2500
    d.phase = 'gameover'
    commitSession(d, false)
    const entry = d.history[0]
    expect(entry).toBeDefined()
    expect(entry.saves).toBeGreaterThanOrEqual(2)
    expect(entry.kickbacks).toBeGreaterThanOrEqual(1)
    expect(entry.score).toBe(2500)
  })
})
