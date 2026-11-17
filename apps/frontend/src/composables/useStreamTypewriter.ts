import { computed, onUnmounted, ref } from "vue";

type StreamTypewriterOptions = {
  /** 积压较少时每个间隔揭示的字符数 */
  baseCharsPerTick?: number;
  /** 约等于每字间隔（毫秒） */
  tickMs?: number;
};

/**
 * SSE 可能一次性推送整段答案；该 composable 将「已接收全文」与「已展示文字」分离，按字数平滑揭示。
 */
export function useStreamTypewriter(options: StreamTypewriterOptions = {}) {
  const tickMs = options.tickMs ?? 20;
  const baseCharsPerTick = options.baseCharsPerTick ?? 1;

  const source = ref("");
  const displayed = ref("");
  const sessionOpen = ref(false);

  let timer: ReturnType<typeof setInterval> | null = null;
  let finishResolve: (() => void) | null = null;

  const backlog = computed(() => Math.max(0, source.value.length - displayed.value.length));
  const isRevealing = computed(() => backlog.value > 0);

  function charsPerTick(remaining: number): number {
    if (remaining > 800) return Math.max(baseCharsPerTick, 24);
    if (remaining > 400) return Math.max(baseCharsPerTick, 12);
    if (remaining > 120) return Math.max(baseCharsPerTick, 4);
    if (remaining > 40) return Math.max(baseCharsPerTick, 2);
    return baseCharsPerTick;
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tryResolveFinish() {
    if (!sessionOpen.value && backlog.value === 0 && finishResolve) {
      finishResolve();
      finishResolve = null;
    }
  }

  function tick() {
    const remain = backlog.value;
    if (remain === 0) {
      stopTimer();
      tryResolveFinish();
      return;
    }

    const take = charsPerTick(remain);
    const nextLen = displayed.value.length + take;
    displayed.value = source.value.slice(0, nextLen);
  }

  function ensureTimer() {
    if (timer !== null) return;
    timer = setInterval(tick, tickMs);
  }

  function begin() {
    stopTimer();
    finishResolve = null;
    source.value = "";
    displayed.value = "";
    sessionOpen.value = true;
  }

  function push(text: string) {
    if (!text) return;
    source.value += text;
    ensureTimer();
  }

  function replaceAll(text: string) {
    source.value = text;
    if (displayed.value.length > source.value.length) {
      displayed.value = source.value;
    }
    ensureTimer();
  }

  /** SSE 已结束：继续揭示直至 backlog 为 0 */
  function endSession(): Promise<void> {
    sessionOpen.value = false;
    if (backlog.value === 0) return Promise.resolve();
    return new Promise((resolve) => {
      finishResolve = resolve;
      ensureTimer();
    });
  }

  /** 用户中止：展示与入库均使用当前已接收全文 */
  function snapToSource() {
    sessionOpen.value = false;
    stopTimer();
    displayed.value = source.value;
    if (finishResolve) {
      finishResolve();
      finishResolve = null;
    }
  }

  function reset() {
    sessionOpen.value = false;
    stopTimer();
    finishResolve = null;
    source.value = "";
    displayed.value = "";
  }

  onUnmounted(reset);

  return {
    source,
    displayed,
    sessionOpen,
    isRevealing,
    begin,
    push,
    replaceAll,
    endSession,
    snapToSource,
    reset,
  };
}