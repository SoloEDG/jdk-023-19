<script setup lang="ts">
import { computed } from 'vue'
import type { PinballDocument } from '@/shared/document'

const props = defineProps<{ doc: PinballDocument }>()

const saverSeconds = computed(() => (props.doc.rescue.saverRemainMs / 1000).toFixed(1))

function lampClass(side: 'left' | 'right'): string {
  if (props.doc.nudge.tilted) return 'lamp lamp-tilt'
  return props.doc.rescue.kickback[side] > 0 ? 'lamp lamp-on' : 'lamp lamp-off'
}
</script>

<template>
  <section class="slip" aria-label="球保与踢回">
    <header class="slip-head">
      <p class="eyebrow">救援</p>
      <h2>{{ doc.rescue.saverActive ? `球保 ${saverSeconds} 秒` : '球保未启动' }}</h2>
    </header>

    <div class="rescue-lamps">
      <div class="lamp-row">
        <span :class="lampClass('left')" aria-hidden="true"></span>
        <span>左出球道踢回 · 剩 {{ doc.rescue.kickback.left }} 次</span>
      </div>
      <div class="lamp-row">
        <span :class="lampClass('right')" aria-hidden="true"></span>
        <span>右出球道踢回 · 剩 {{ doc.rescue.kickback.right }} 次</span>
      </div>
    </div>

    <p class="slip-copy">
      球离开发射槽后限时保护，期间漏球回到挡板前方且不减球；左右出球道每颗球各踢回一次。
      同一次落下只触发一种救援，救援不加分、不计破万。
    </p>
    <p v-if="doc.nudge.tilted" class="rescue-tilt">已倾斜：球保与踢回全部失效，漏球实扣。</p>

    <ul v-if="doc.rescue.events.length > 0" class="rescue-log">
      <li v-for="event in doc.rescue.events" :key="event.uid" :class="event.outcome">
        {{ event.text }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.rescue-lamps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}
.lamp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.lamp {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  border: 1px solid rgba(0, 0, 0, 0.4);
}
.lamp-on {
  background: #ffb454;
  box-shadow: 0 0 8px rgba(255, 180, 84, 0.8);
}
.lamp-off {
  background: #4a3a26;
}
.lamp-tilt {
  background: #ff5470;
  box-shadow: 0 0 8px rgba(255, 84, 112, 0.8);
}
.rescue-tilt {
  color: #ff8095;
  font-weight: 600;
}
.rescue-log {
  margin: 8px 0 0;
  padding-left: 16px;
  font-size: 11.5px;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rescue-log .saved {
  color: #37e6b0;
}
.rescue-log .kickback {
  color: #ffb454;
}
</style>
