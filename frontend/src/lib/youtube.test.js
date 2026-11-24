import { describe, it, expect, vi } from 'vitest'
import { youtubeId, youtubeLinks } from './youtube.js'

describe('YouTube exercise links', () => {
  it('accepts only known hosts and complete video IDs', () => {
    for (const url of ['https://youtu.be/99QhMQoxmOk', 'youtube.com/watch?v=99QhMQoxmOk', 'https://m.youtube.com/shorts/99QhMQoxmOk', 'https://www.youtube-nocookie.com/embed/99QhMQoxmOk']) {
      expect(youtubeId(url)).toBe('99QhMQoxmOk')
    }
    for (const url of ['https://youtube.com.evil.test/watch?v=99QhMQoxmOk', 'javascript:alert(1)', 'https://user@youtube.com/watch?v=99QhMQoxmOk', 'https://youtube.com:8443/watch?v=99QhMQoxmOk', 'https://youtube.com/playlist?list=99QhMQoxmOk', 'https://youtu.be/x', null]) expect(youtubeId(url)).toBeNull()
  })
  it('extracts and deduplicates video references without treating other links as embeds', () => {
    expect(youtubeLinks('Squat: https://www.youtube.com/watch?v=99QhMQoxmOk; same: https://youtu.be/99QhMQoxmOk\nOther: https://example.org')).toEqual(['https://youtu.be/99QhMQoxmOk'])
  })
})

// This fork builds with VITE_NO_YOUTUBE=1: no search link and no player at all.
describe('a build without YouTube (VITE_NO_YOUTUBE=1)', () => {
  it('offers no search and embeds no pasted link', async () => {
    vi.stubEnv('VITE_NO_YOUTUBE', '1')
    try {
      const y = await import('./youtube.js')
      expect(y.youtubeSearchUrl({ n: 'Bench Press' })).toBe(null)
      expect(y.youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe(null)
      expect(y.youtubeLinks('see https://youtu.be/dQw4w9WgXcQ')).toEqual([])
    } finally { vi.unstubAllEnvs() }
  })
  it('keeps both when the flag is not set', async () => {
    const y = await import('./youtube.js')
    expect(y.youtubeSearchUrl({ n: 'Bench Press' })).toContain('youtube.com/results')
    expect(y.youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
})
