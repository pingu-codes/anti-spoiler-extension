/** Skips by `delta` seconds, stopping just short of the end so the end screen doesn't trigger. */
export function seek(video: HTMLVideoElement, delta: number) {
  const end = video.duration - 1;
  video.currentTime = Math.max(0, Math.min(video.currentTime + delta, end));
}
