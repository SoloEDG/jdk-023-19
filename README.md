# 霓虹弹珠厅

## 安装

```bash
npm install
```

## 本地启动

```bash
npm run dev
```

## 测试与构建

```bash
npm test       # vitest 单测（规则 + 游戏循环集成，共 28 项）
npm run typecheck
npm run build
```

## Docker 启动

```bash
docker compose up --build
```

## 操作

- `A` / 左 `Shift`：左挡板，`D` / 右 `Shift`：右挡板
- `空格`：按住蓄力、松开发射
- `Q` / `E`：左右轻推，三次触发倾斜
- `P` / `Esc`：暂停

## 救援机制（features/rescue）

| 规则 | 实现要点 |
| --- | --- |
| 球离开发射槽后限时保护（默认 6 秒），期间从底部漏球回到挡板前方、不减球 | scoop 乘坐结束置 `signals.scoopReleased`，循环据此 `startSaver`；`saveBall` 重生到挡板前，不改 `ballsLeft` |
| 保护不加分，只记录"这颗球被救过"，不计入破万进度 | 救援路径不写 `score`/`feed`，只写 `rescue.ballSaves` 与救援事件；破万仍只由真实得分驱动 |
| 左右出球道每颗球各一次踢回，把球推回台内；换球补满 | `rescue.kickback` 每球重置为 `{left:1,right:1}`；`applyKickback` 送球回安全区 |
| 同一次落下不能又保护又踢回 | `resolveDrain` 是单一优先级裁决（倾斜 > 踢回 > 球保 > 实扣），一次调用只产生一个结果 |
| 踢回力道不能把球推出边界 | 踢回瞬间速率封顶 `KICKBACK_SPEED_CAP`，重生点在台面内；有全程不出界的物理测试 |
| 倾斜后保护与踢回全部失效，漏球实扣 | `resolveDrain` 首条分支判断 `nudge.tilted`，直接返回实扣，踢回不消耗 |
| 保护时间在暂停时停住 | 暂停帧在 `runFrame` 提前返回，`tickRescue` 不被调用，倒计时天然冻结 |
| 保护不加球，三颗球打完才结束 | 只有 `applyDrain` 递减 `ballsLeft`；初始 3 颗，三次实扣进入 gameover |

### 关键状态与不变量

- `rescue.laneRoute`：球下坠进入出球道区域时锁定左/右，漏球按锁定侧别裁决，
  即使之后反弹到中路也不改变（见集成测试）。
- `rescue.graceMs`：救回/踢回后的重新入台宽限，期间 `markDrainOrSeat` 不判漏球、
  `trackOutlane` 不追踪，保证重生过程不被当成第二次落下。
- 力道不足没打过槽顶、重新落回发射槽时，离槽标记与保护复位，下次真正离槽仍会启动球保。
- 历史记录新增 `saves` / `kickbacks` 两列，仅作记录，不影响分数与挑战。
