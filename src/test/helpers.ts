import { createDocument, type PinballDocument } from '@/shared/document'
import { createMechanisms, mountFresh } from '@/features/table'
import { emptyKept } from '@/features/records'
import { idleInput, type FrameInput } from '@/shared/commands'

// 构造一份已装好机关、进入游玩态的文档
export function makeDoc(): PinballDocument {
  const doc = createDocument()
  mountFresh(doc, emptyKept())
  doc.phase = 'playing'
  doc.run.launched = true
  return doc
}

export function mechanismsReady(doc: PinballDocument): void {
  if (doc.mechanisms.length === 0) doc.mechanisms = createMechanisms()
}

export function noInput(): FrameInput {
  return { ...idleInput() }
}

// 让球进入自由运动状态并放到指定坐标
export function freeBall(doc: PinballDocument, x: number, y: number, vy = 400): void {
  doc.ball.held = 'none'
  doc.ball.x = x
  doc.ball.y = y
  doc.ball.vx = 0
  doc.ball.vy = vy
}
