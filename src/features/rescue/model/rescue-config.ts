import type { RescueState } from '@/shared/document'

// 球保时长：球离开发射槽（进入台面）后的保护窗口，毫秒
export const SAVER_MS = 6000

// 左右出球道各有一次踢回；换到下一颗球时重新给满
export const KICKBACK_PER_BALL = 1

// 救回 / 踢回后的重新入台宽限（毫秒）：期间不再判漏球、不追踪出球道，
// 保证同一次落下只产生一个裁决结果，重生过程不会被当成第二次漏球。
export const RESCUE_GRACE_MS = 1000

// 踢回速率上限（像素/秒）。重生点在台面内部且初速受限，
// 配合墙体反弹，球不可能被推出台面边界。
export const KICKBACK_SPEED_CAP = 1050

// 出球道追踪带：球在下坠（vy>0）且落进该纵向区域时锁定所属通道
export const OUTLANE = {
  topY: 560,
  leftMaxX: 96,
  rightMinX: 300,
}

// 救回 / 踢回的重生位置（挡板前方的台面安全区，在漏球判定之上）
export const RESCUE_SPOT = {
  x: 200,
  saveY: 540,
  kickY: 500,
}

export function createRescueState(): RescueState {
  return {
    saverActive: false,
    saverRemainMs: 0,
    kickback: { left: KICKBACK_PER_BALL, right: KICKBACK_PER_BALL },
    laneRoute: null,
    graceMs: 0,
    ballSaved: false,
    ballSaves: 0,
    ballKickbacks: { left: 0, right: 0 },
    events: [],
    eventSeq: 0,
  }
}

// 换新球时重置每球相关的救援状态（踢回补满、保护清空、记录归零）
export function resetRescueForBall(state: RescueState): void {
  state.saverActive = false
  state.saverRemainMs = 0
  state.kickback = { left: KICKBACK_PER_BALL, right: KICKBACK_PER_BALL }
  state.laneRoute = null
  state.graceMs = 0
  state.ballSaved = false
  state.ballSaves = 0
  state.ballKickbacks = { left: 0, right: 0 }
}
