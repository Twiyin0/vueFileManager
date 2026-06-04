/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'aplayer' {
  interface APlayerOptions {
    container: HTMLElement
    autoplay?: boolean
    theme?: string
    loop?: string
    order?: string
    preload?: string
    volume?: number
    mutex?: boolean
    listFolded?: boolean
    listMaxHeight?: string
    lrcType?: number
    audio: Array<{
      name: string
      artist: string
      url: string
      cover?: string
      lrc?: string
      theme?: string
    }>
  }
  class APlayer {
    constructor(options: APlayerOptions)
    play(): void
    pause(): void
    destroy(): void
    list: { audios: Array<{ name: string; artist: string; url: string; cover: string }> }
  }
  export default APlayer
}
