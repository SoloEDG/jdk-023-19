import { describe, expect, it } from 'vitest'
import { createDocument, type PinballDocument } from '@/shared/document'
import {
  KICKBACK_SPEED_CAP,
  resetRescueForBall,
  SAVER_MS,
} from '@/features/rescue/model/rescue-config'
import {
  ballRescueCount,
  resolveDrain,
  startSaver,
  tickRescue,
  trackOutlane,
} from '@/features/rescue/model/rescue-rules'
import { speedOf } from '@/shared/geometry'

function doc(): PinballDocument {
  const d = createDocument()
  d.phase = 'playing'
  d.ball.held = 'none'
  return d
}

function drainAt(d: PinballDocument, x: number): void {
  // 直接把球放到漏球线之下，触发裁决
  d.ball.held = 'none'
  d.ball.x = x
  d.ball.y = 712
  d.ball.vy = 300
}

describe('球保', () => {
  it('球离槽后启动，限时 SAVER_MS，暂停帧不推进由调用方保证', () => {
    const d = doc()
    d.ball.held = 'scoop'
    startSaver(d)
    expect(d.rescue.saverActive).toBe(true)
    expect(d.rescue.saverRemainMs).toBe(SAVER_MS)
    expect(d.ball.launchedOnce).toBe(true)
    // 同一颗球只启动一次
    startSaver(d)
    expect(d.rescue.saverRemainMs).toBe(SAVER_MS)
  })

  it('保护期内中路漏球：救回、球数不变、不加分，只记录被救过', () => {
    const d = doc()
    startSaver(d)
    const balls = d.ballsLeft
    const score = d.score
    drainAt(d, 200)
    const rescued = resolveDrain(d)
    expect(rescued).toBe(true)
    expect(d.ballsLeft).toBe(balls)
    expect(d.score).toBe(score)
    expect(d.rescue.ballSaved).toBe(true)
    expect(d.rescue.ballSaves).toBe(1)
    expect(d.rescue.events[0]?.outcome).toBe('saved')
    // 球被送回挡板前方且在漏球线之上
    expect(d.ball.y).toBeLessThan(704)
  })

  it('倒计时归零后保护失效，漏球走实扣', () => {
    const d = doc()
    startSaver(d)
    tickRescue(d, SAVER_MS)
    expect(d.rescue.saverActive).toBe(false)
    drainAt(d, 200)
    expect(resolveDrain(d)).toBe(false)
  })

  it('tickRescue 只按传入 dt 扣减，模拟暂停（不调用）时倒计时纹丝不动', () => {
    const d = doc()
    startSaver(d)
    tickRescue(d, 1000)
    const after = d.rescue.saverRemainMs
    // 暂停：连续"空转"若干次而不调用 tickRescue，数值保持
    for (let i = 0; i < 10; i++) {
      /* paused frame: no tickRescue */
    }
    expect(d.rescue.saverRemainMs).toBe(after)
    // 恢复后继续扣
    tickRescue(d, 500)
    expect(d.rescue.saverRemainMs).toBe(after - 500)
  })
})

describe('踢回', () => {
  it('左出球道漏球优先踢回，消耗一次且不加分、不减球', () => {
    const d = doc()
    startSaver(d) // 保护同时生效，验证踢回优先
    const score = d.score
    drainAt(d, 60)
    d.rescue.laneRoute = 'left'
    const rescued = resolveDrain(d)
    expect(rescued).toBe(true)
    expect(d.rescue.kickback.left).toBe(0)
    expect(d.rescue.ballKickbacks.left).toBe(1)
    expect(d.rescue.ballSaves).toBe(0) // 没有同时触发球保
    expect(d.score).toBe(score)
    expect(d.ballsLeft).toBe(3)
    expect(d.rescue.events[0]?.outcome).toBe('kickback')
  })

  it('右出球道同理', () => {
    const d = doc()
    startSaver(d)
    drainAt(d, 330)
    d.rescue.laneRoute = 'right'
    expect(resolveDrain(d)).toBe(true)
    expect(d.rescue.kickback.right).toBe(0)
    expect(d.rescue.ballKickbacks.right).toBe(1)
  })

  it('每侧只有一次：用尽后同侧再漏，保护期内由球保接住，之后实扣', () => {
    const d = doc()
    startSaver(d)
    d.rescue.laneRoute = 'left'
    drainAt(d, 60)
    expect(resolveDrain(d)).toBe(true) // 第一次踢回
    expect(d.rescue.kickback.left).toBe(0)

    d.rescue.laneRoute = 'left'
    drainAt(d, 60)
    expect(resolveDrain(d)).toBe(true) // 第二次走球保
    expect(d.rescue.ballSaves).toBe(1)

    d.rescue.saverActive = false
    d.rescue.laneRoute = 'left'
    drainAt(d, 60)
    expect(resolveDrain(d)).toBe(false) // 第三次实扣
  })

  it('踢回初速严格不超过上限，重生点在台面内（不可能推出边界）', () => {
    const d = doc()
    startSaver(d)
    d.rescue.laneRoute = 'right'
    drainAt(d, 330)
    resolveDrain(d)
    const speed = speedOf(d.ball.vx, d.ball.vy)
    expect(speed).toBeLessThanOrEqual(KICKBACK_SPEED_CAP + 1e-9)
    expect(d.ball.x - d.ball.radius).toBeGreaterThan(0)
    expect(d.ball.x + d.ball.radius).toBeLessThan(400)
    expect(d.ball.y - d.ball.radius).toBeGreaterThan(0)
  })

  it('换到下一颗球时左右踢回重新给满、球保清空', () => {
    const d = doc()
    startSaver(d)
    d.rescue.laneRoute = 'left'
    drainAt(d, 60)
    resolveDrain(d)
    d.rescue.laneRoute = 'right'
    drainAt(d, 330)
    resolveDrain(d)
    expect(d.rescue.kickback).toEqual({ left: 0, right: 0 })

    resetRescueForBall(d.rescue)
    expect(d.rescue.kickback).toEqual({ left: 1, right: 1 })
    expect(d.rescue.saverActive).toBe(false)
    expect(d.rescue.ballSaves).toBe(0)
  })
})

describe('倾斜惩罚', () => {
  it('倾斜后保护与踢回都不发生，漏球实扣且踢回不被消耗', () => {
    const d = doc()
    startSaver(d)
    d.nudge.tilted = true

    d.rescue.laneRoute = 'left'
    drainAt(d, 60) // 左踢回本可用
    expect(resolveDrain(d)).toBe(false)
    expect(d.rescue.kickback.left).toBe(1)
    expect(d.rescue.ballSaves).toBe(0)
    expect(d.rescue.ballKickbacks.left).toBe(0)

    d.rescue.laneRoute = null
    drainAt(d, 200) // 中路保护本生效
    expect(resolveDrain(d)).toBe(false)
  })
})

describe('互斥与通道追踪', () => {
  it('一次落下只产生一个救援结果（裁决函数无分支叠加）', () => {
    const d = doc()
    startSaver(d)
    d.rescue.laneRoute = 'left'
    drainAt(d, 60)
    resolveDrain(d)
    // 只有一条事件，且计数要么进 kickbacks 要么进 saves，不会同时增加
    expect(d.rescue.events).toHaveLength(1)
    expect(ballRescueCount(d)).toBe(1)
  })

  it('下坠进入出球道区域时锁定通道，水平坐标之后反弹也不改变裁决侧别', () => {
    const d = doc()
    freeInLane(d, 70, 580)
    trackOutlane(d)
    expect(d.rescue.laneRoute).toBe('left')
    // 模拟反弹把球带到中路
    d.ball.x = 200
    trackOutlane(d)
    expect(d.rescue.laneRoute).toBe('left')

    const d2 = doc()
    freeInLane(d2, 320, 580)
    trackOutlane(d2)
    expect(d2.rescue.laneRoute).toBe('right')
  })

  it('宽限期内不追踪通道', () => {
    const d = doc()
    d.rescue.graceMs = 500
    freeInLane(d, 70, 580)
    trackOutlane(d)
    expect(d.rescue.laneRoute).toBeNull()
  })

  it('中路漏球不消耗任何踢回', () => {
    const d = doc()
    startSaver(d)
    drainAt(d, 200)
    resolveDrain(d)
    expect(d.rescue.kickback).toEqual({ left: 1, right: 1 })
  })
})

function freeInLane(d: PinballDocument, x: number, y: number): void {
  d.ball.held = 'none'
  d.ball.x = x
  d.ball.y = y
  d.ball.vx = 0
  d.ball.vy = 300
}
