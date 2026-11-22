import { flashNote, type DrainRoute, type PinballDocument, type RescueEvent } from '@/shared/document'
import {
  KICKBACK_SPEED_CAP,
  OUTLANE,
  RESCUE_GRACE_MS,
  RESCUE_SPOT,
  SAVER_MS,
} from '@/features/rescue/model/rescue-config'

// 球真正离开发射槽（scoop 乘坐结束、进入台面）后启动球保
export function startSaver(doc: PinballDocument): void {
  const rescue = doc.rescue
  if (doc.ball.launchedOnce) return
  doc.ball.launchedOnce = true
  rescue.saverActive = true
  rescue.saverRemainMs = SAVER_MS
  rescue.laneRoute = null
  rescue.graceMs = 0
  flashNote(doc, `球保启动：${SAVER_MS / 1000} 秒内漏球可救回`)
}

// 每帧推进：球保与宽限都只在游玩帧递减，暂停帧根本不会调用，故天然冻结
export function tickRescue(doc: PinballDocument, dtMs: number): void {
  const rescue = doc.rescue
  if (rescue.graceMs > 0) rescue.graceMs = Math.max(0, rescue.graceMs - dtMs)
  if (!rescue.saverActive) return
  rescue.saverRemainMs = Math.max(0, rescue.saverRemainMs - dtMs)
  if (rescue.saverRemainMs === 0) rescue.saverActive = false
}

// 球下坠进入出球道区域时锁定通道；只在自由运动、无宽限时追踪
export function trackOutlane(doc: PinballDocument): void {
  const rescue = doc.rescue
  const ball = doc.ball
  if (rescue.graceMs > 0 || rescue.laneRoute || ball.held !== 'none') return
  if (ball.vy <= 0 || ball.y < OUTLANE.topY) return
  if (ball.x < OUTLANE.leftMaxX) rescue.laneRoute = 'left'
  else if (ball.x > OUTLANE.rightMinX) rescue.laneRoute = 'right'
}

function routeOf(doc: PinballDocument): DrainRoute {
  const locked = doc.rescue.laneRoute
  if (locked) return locked
  const x = doc.ball.x
  if (x < OUTLANE.leftMaxX) return 'left'
  if (x > OUTLANE.rightMinX) return 'right'
  return 'center'
}

function pushEvent(doc: PinballDocument, event: Omit<RescueEvent, 'uid'>): void {
  const rescue = doc.rescue
  rescue.eventSeq += 1
  rescue.events.unshift({ uid: rescue.eventSeq, ...event })
  if (rescue.events.length > 8) rescue.events.length = 8
}

function routeLabel(route: DrainRoute): string {
  return route === 'center' ? '中路' : route === 'left' ? '左出球道' : '右出球道'
}

// 踢回：把球推回台面安全区，速率严格封顶，物理上不可能出界；不加分
function applyKickback(doc: PinballDocument, route: Exclude<DrainRoute, 'center'>): void {
  const rescue = doc.rescue
  rescue.kickback[route] -= 1
  rescue.ballKickbacks[route] += 1
  const ball = doc.ball
  ball.x = RESCUE_SPOT.x + (route === 'left' ? -26 : 26)
  ball.y = RESCUE_SPOT.kickY
  // 向内的水平分量 + 向上速度，合成速率不超过上限
  ball.vx = route === 'left' ? 80 : -80
  ball.vy = -Math.sqrt(Math.max(0, KICKBACK_SPEED_CAP ** 2 - ball.vx ** 2))
  ball.held = 'none'
  ball.holdMs = 0
  ball.rideMs = 0
  rescue.laneRoute = null
  rescue.graceMs = RESCUE_GRACE_MS
  const left = rescue.kickback[route]
  pushEvent(doc, {
    outcome: 'kickback',
    route,
    text: `${routeLabel(route)}踢回，把球推回台内（本侧剩余 ${left} 次，不加分）`,
  })
  flashNote(doc, '踢回！球回到台面')
}

// 球保救回：回到挡板前方，球数不变、不加分，只记录本颗球被救过
function applySave(doc: PinballDocument, route: DrainRoute): void {
  const rescue = doc.rescue
  rescue.ballSaved = true
  rescue.ballSaves += 1
  const ball = doc.ball
  ball.x = RESCUE_SPOT.x + (Math.random() - 0.5) * 24
  ball.y = RESCUE_SPOT.saveY
  ball.vx = (Math.random() - 0.5) * 60
  ball.vy = -80
  ball.held = 'none'
  ball.holdMs = 0
  ball.rideMs = 0
  rescue.laneRoute = null
  rescue.graceMs = RESCUE_GRACE_MS
  pushEvent(doc, {
    outcome: 'saved',
    route,
    text: `${routeLabel(route)}漏球被球保救回（本球第 ${rescue.ballSaves} 次，不加分）`,
  })
  flashNote(doc, '球保救回，球数不变')
}

/**
 * 漏球裁决：同一次落下有且只有一个结果。
 * 优先级：倾斜（实扣） > 出球道踢回 > 球保救回 > 实扣。
 * 返回 true 表示本次漏球被救援拦下（不减少球数）；false 表示应交由 applyDrain 实扣。
 */
export function resolveDrain(doc: PinballDocument): boolean {
  const rescue = doc.rescue
  const route = routeOf(doc)

  // 1) 倾斜：惩罚生效，保护与踢回全部不发生，落球实扣
  if (doc.nudge.tilted) {
    rescue.laneRoute = null
    return false
  }

  // 2) 左/右出球道且该侧踢回仍有余量：踢回优先于球保，二者互斥
  if ((route === 'left' || route === 'right') && rescue.kickback[route] > 0) {
    applyKickback(doc, route)
    return true
  }

  // 3) 球保生效中：救回挡板前方（不加分、不减球）
  if (rescue.saverActive) {
    applySave(doc, route)
    return true
  }

  // 4) 无任何救援：实扣
  rescue.laneRoute = null
  return false
}

// 当前球被救过的总次数（球保 + 踢回），用于记录与对局统计
export function ballRescueCount(doc: PinballDocument): number {
  const rescue = doc.rescue
  return rescue.ballSaves + rescue.ballKickbacks.left + rescue.ballKickbacks.right
}
