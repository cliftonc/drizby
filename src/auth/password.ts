import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err)
      resolve(`${salt}:${derivedKey.toString('hex')}`)
    })
  })
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':')
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err)
      resolve(timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey))
    })
  })
}
