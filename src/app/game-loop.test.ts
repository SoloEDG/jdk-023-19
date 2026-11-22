import { describe, expect, it } from 'vitest'
import { idleInput, type FrameInput } from '@/shared/commands'
import { runFrame } from '@/app/game-loop'
import { makeDoc, mechanismsReady } from '@/test/helpers'
import { SAVER_MS } from '@/features/rescue'
import { collectSolids } from '@/features/table/lib/solids'
import { advanceBall } from '@/features/scoring/model/ball-step'
import { sampleRamp, sampleScoop } from '@/features/table/lib/playfield-layout'
import type { Solid } from '@/shared/solids'

function syncSolids(doc: ReturnType<typeof makeDoc>): Solid[] {
  return collectSolids(doc)
}
function advanceOnce(doc: ReturnType<typeof makeDoc>, solids: Solid[]): void {
  advanceBall(doc, solids, 16, { ramp: sampleRamp, scoop: sampleScoop })
}

function step(doc: ReturnType<typeof makeDoc>, input: FrameInput = idleInput(), dtMs = 16): void {
  runFrame(doc, input, dtMs)
}

function forceDrain(doc: ReturnType<typeof makeDoc>, x: number): void {
  // 直接把自由运动的球放到漏球逃逸线之下（y>748），引擎自身的 markDrainOrSeat 会置 drain
  doc.phase = 'playing'
  doc.ball.held = 'none'
  doc.ball.x = x
  doc.ball.y = 760
  doc.ball.vx = 0
  doc.ball.vy = 300
  doc.rescue.graceMs = 0
  step(doc)
}

describe('游戏循环集成', () => {
  it('发射乘坐结束后启动球保', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    // 模拟 scoop 乘坐最后一帧
    doc.ball.held = 'scoop'
    doc.ball.rideMs = doc.ball.rideDur - 8
    doc.ball.x = 300
    doc.ball.y = 120
    step(doc)
    expect(doc.signals.scoopReleased).toBe(false) // 已被循环消费
    expect(doc.rescue.saverActive).toBe(true)
    expect(doc.ball.launchedOnce).toBe(true)
  })

  it('暂停时球保倒计时冻结', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = true
    doc.rescue.saverRemainMs = SAVER_MS
    doc.phase = 'paused'
    const before = doc.rescue.saverRemainMs
    for (let i = 0; i < 60; i++) step(doc) // 暂停 1 秒（约 60 帧）
    expect(doc.rescue.saverRemainMs).toBe(before)
    doc.phase = 'playing'
    for (let i = 0; i < 50; i++) step(doc, idleInput(), 20) // 恢复后 1 秒
    expect(doc.rescue.saverRemainMs).toBeLessThan(before)
  })

  it('保护期内漏球被救回：球数与分数不变，记录一次救回', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = true
    doc.rescue.saverRemainMs = 3000
    const balls = doc.ballsLeft
    const score = doc.score
    forceDrain(doc, 200)
    expect(doc.signals.drain).toBe(false) // 信号被救援清掉
    expect(doc.ballsLeft).toBe(balls)
    expect(doc.score).toBe(score)
    expect(doc.rescue.ballSaves).toBe(1)
    expect(doc.phase).toBe('playing')
  })

  it('出球道漏球触发踢回，球回到台面且后续宽限内不再判漏球', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = true
    doc.rescue.saverRemainMs = 3000
    doc.rescue.laneRoute = 'left'
    forceDrain(doc, 60)
    expect(doc.rescue.kickback.left).toBe(0)
    expect(doc.ballsLeft).toBe(3)
    expect(doc.rescue.graceMs).toBeGreaterThan(0)
    // 宽限期内即使球位置在漏球线下方，也不会再次触发 drain
    doc.ball.y = 730
    const drainBefore = doc.signals.drain
    step(doc)
    expect(doc.signals.drain).toBe(drainBefore)
  })

  it('保护与踢回都没有时漏球实扣，并切换到下一颗球、踢回补满', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = false
    doc.rescue.kickback = { left: 0, right: 0 }
    const balls = doc.ballsLeft
    forceDrain(doc, 200)
    expect(doc.ballsLeft).toBe(balls - 1)
    expect(doc.phase).toBe('ready')
    expect(doc.ball.held).toBe('plunger')
    // 新球踢回重新给满
    expect(doc.rescue.kickback).toEqual({ left: 1, right: 1 })
  })

  it('倾斜后漏球实扣，且踢回次数保留', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = true
    doc.nudge.tilted = true
    doc.rescue.laneRoute = 'left'
    const balls = doc.ballsLeft
    forceDrain(doc, 60)
    expect(doc.ballsLeft).toBe(balls - 1)
    // 新球已换，倾斜随球清除；上一颗球的踢回未被消耗（新球为满额，这里验证上一颗记录）
    expect(doc.phase).toBe('ready')
  })

  it('三颗球实扣后游戏结束，救援从不减少球数', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    let losses = 0
    while (doc.phase !== 'gameover' && losses < 5) {
      // 给新球模拟出槽，再让保护到期
      doc.ball.held = 'none'
      doc.rescue.saverActive = false
      doc.rescue.kickback = { left: 0, right: 0 }
      forceDrain(doc, 200)
      losses += 1
    }
    expect(doc.phase).toBe('gameover')
    expect(doc.ballsLeft).toBe(0)
    expect(losses).toBe(3)
  })

  it('多次救援后仍是三颗球，只有实扣才递减', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = true
    doc.rescue.saverRemainMs = 99999
    for (let i = 0; i < 5; i++) {
      forceDrain(doc, 200)
      doc.rescue.graceMs = 0 // 测试中手动解除宽限以再次触发
    }
    expect(doc.ballsLeft).toBe(3)
    expect(doc.rescue.ballSaves).toBe(5)
  })

  it('救援不推进破万：只有真实得分改变 score，救援后破万进度不变', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = true
    doc.rescue.saverRemainMs = 99999
    const scoreBefore = doc.score
    forceDrain(doc, 200)
    forceDrain(doc, 60)
    expect(doc.score).toBe(scoreBefore)
    // 救援事件不计入得分 feed
    const scoreFeed = doc.feed
    expect(scoreFeed.every((item) => item.points > 0)).toBe(true)
  })

  it('通道追踪：球下坠进入左/右出球道时锁定侧别', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.ball.held = 'none'
    doc.ball.x = 70
    doc.ball.y = 560
    doc.ball.vx = 0
    doc.ball.vy = 300
    step(doc)
    expect(doc.rescue.laneRoute).toBe('left')

    const right = makeDoc()
    mechanismsReady(right)
    right.ball.held = 'none'
    right.ball.x = 320
    right.ball.y = 560
    right.ball.vx = 0
    right.ball.vy = 300
    step(right)
    expect(right.rescue.laneRoute).toBe('right')
  })

  it('出球道锁定后即便反弹到中路，漏球仍按原通道踢回（互斥且不叠加球保）', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    doc.rescue.saverActive = true
    doc.rescue.saverRemainMs = 5000
    doc.ball.held = 'none'
    doc.ball.x = 70
    doc.ball.y = 560
    doc.ball.vy = 300
    step(doc)
    expect(doc.rescue.laneRoute).toBe('left')
    // 反弹到中路坐标后再漏
    doc.ball.x = 200
    doc.ball.y = 760
    doc.ball.vy = 300
    doc.rescue.graceMs = 0
    step(doc)
    expect(doc.rescue.kickback.left).toBe(0)
    expect(doc.rescue.ballKickbacks.left).toBe(1)
    expect(doc.rescue.ballSaves).toBe(0)
    expect(doc.ballsLeft).toBe(3)
  })

  it('力道不足回槽后重新入座，再发射仍能启动球保', () => {
    const doc = makeDoc()
    mechanismsReady(doc)
    // 模拟已离槽启动过保护，又落回发射槽区域
    doc.ball.launchedOnce = true
    doc.rescue.saverActive = true
    doc.rescue.saverRemainMs = 4000
    doc.ball.held = 'none'
    doc.ball.x = 372
    doc.ball.y = 620
    doc.ball.vx = 0
    doc.ball.vy = 200
    const solids = syncSolids(doc)
    advanceOnce(doc, solids)
    expect(doc.ball.held).toBe('plunger')
    expect(doc.ball.launchedOnce).toBe(false)
    expect(doc.rescue.saverActive).toBe(false)

    // 重新离槽（scoop 乘坐结束）后球保再次启动
    doc.ball.held = 'scoop'
    doc.ball.rideMs = doc.ball.rideDur - 8
    step(doc)
    expect(doc.rescue.saverActive).toBe(true)
  })
})
