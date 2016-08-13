'use strict'

import http from 'http'
import Busboy from 'busboy'
import csv from 'csv-parser'
import { json } from 'micro'

class FileError extends Error {
  constructor(message) {
    super()
    this.name = this.constructor.name
    this.message = message
    this.statusCode = 400
    Error.captureStackTrace(this, this.constructor)
  }
}

export async function loadFromForm(req) {
  let result = [], fields = {}, error
  let stream = new Busboy({ headers: req.headers })

  stream.on('file', (name, file, filename, encoding, type) => {

    if ('text/csv' !== type) {
      file.resume()
      return error = new FileError('Invalid file type')
    }

    file.pipe(csv()).on('data', data => {
      result.push(data)
    })

    file.on('error', e => error = e)
  })

  stream.on('field', (name, value) => {
    fields[name] = value
  })

  stream.on('finish', () => {
    if (!error) result = result.map(obj => ({ ...obj, ...fields }))
  })

  req.pipe(stream)

  try {
    return await new Promise((resolve, reject) => {
      stream.on('finish', () => {
        if (error) return reject(error)
        resolve(result)
      })
      stream.on('error', reject)
    })
  } catch(e) {
    return e
  }
}

export async function loadFromURL(req) {
  try {
    let body = await json(req)

    if ('string' === typeof body.file) {
      return await new Promise((resolve, reject) => {

        http.get(body.file, res => {
          let result = [], error
          let stream = res.pipe(csv())

          stream.on('data', data => {
            result.push(data)
          })

          stream.on('end', () => {
            delete body.file
            resolve(result.map(obj => ({ ...obj, ...body })))
          })

          stream.on('error', e => reject(e))

        }).on('error', reject)
      })
    } else {
      return body
    }
  } catch(e) {
    return e
  }
}

export default req => {
  return (/form-data/g.test(req.headers['content-type']))
    ? loadFromForm(req)
    : loadFromURL(req)
}
