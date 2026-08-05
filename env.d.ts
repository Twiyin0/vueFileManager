/// <reference types="vite/client" />

declare module 'aplayer' {
  export default class APlayer {
    constructor(options: any)
    audio: any
    list: any
    play(): void
    destroy(): void
  }
}

declare module '*.css'

declare global {
  namespace Express {
    interface Request {
      file?: {
        fieldname: string
        originalname: string
        encoding: string
        mimetype: string
        buffer: Buffer
        size: number
      }
    }
  }
}

export {}
