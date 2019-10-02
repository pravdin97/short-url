var express = require('express');
var router = express.Router();
const uuidv4 = require('uuid/v4');


const LINKSIZE = process.env.LINKSIZE || 8

const links = [
]

/**
 * Поиск объекта, содержащего информацию о ссылке
 * @param shortLink короткая ссылка
 * @returns объект, содержащих информацию о ссылке
 */
function find(shortLink) {
  for (let i = 0; i < links.length; i++)
    if (links[i].short === shortLink)
      return links[i]
  return null
}

/**
 * Поиск по длиннойй ссылке объекта, содержащего информацию о ссылке
 * @param longLink длинная ссылка
 * @returns объект, содержащих информацию о ссылке
 */
function findByLongLink(longLink) {
  for (let i = 0; i < links.length; i++)
    if (links[i].long === longLink)
      return links[i]
  return null
}

/**
 * Поиск всех сслылок, которые создавал пользователь
 * @param owner идентификатор пользователя
 * @returns массив объектов, содержащих информацию о ссылках 
 */
function findUserLinks(owner) {
  let result = []
  for (let i = 0; i < links.length; i++)
    if (links[i].owner === owner) {
      let obj = Object.assign({}, links[i])
      delete obj.owner
      result.push(obj)
    }
  return result
}

/**
 * Генерирование короткой ссылки
 * @param size необходимое количество символов в короткой ссылке
 * @returns короткая ссылка
 */
function generate(size) {
  let result = '';
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for ( let i = 0; i < size; i++ ) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
 * Создание короткой ссылки
 * @param link длинная ссылка, которую надо укоротить 
 * @param owner пользователь - создатель короткой ссылки
 * @returns объект, содержащий длинную и короткую ссылки, количество переходов по ссылке 
 */
function shortenLink(link, owner) {
  // если этот пользователь уже создал короткую ссылку для этой длинной ссылки
  const createdYet = findByLongLink(link)
  if (createdYet !== null && createdYet.owner === owner)
    // вернем существующий объект
    return createdYet

  const shortLink = generate(LINKSIZE)
  
  const created = {
    long: link,
    short: shortLink,
    count: 0,
    owner: owner
  }

  links.push(created)

  return created
}

router.get('/:short', function(req, res) {
  const short = req.params.short
  
  // получаем список всех ссылок пользователя
  // пользователь определяется по токену из куки
  if (short === "mylinks") {
    const tokenFromCookies = req.cookies.shortenAppToken
      if (tokenFromCookies !== undefined){
        const ownerLinks = findUserLinks(tokenFromCookies)
        res.json({
          mylinks: ownerLinks
        })
      }
      else res.json({ message: 'You haven\'t shorten any links'})
  }

  // переход по короткой ссылке
  else {
    const linkObject = find(short)
    if (linkObject !== null) {
      linkObject.count++
      res.redirect(linkObject.long)
    }
    else res.json({ message: 'Error: invalid link' })
  }
})

/**
 * Создание новой короткой ссылки 
 * @param link длинная ссылка, которую неоходимо укоротить
 */
router.get('/', (req, res) => {
  if (req.query.link !== undefined && req.query.link !== "") {
    const longLink = req.query.link
    let token = req.cookies.shortenAppToken
    
    if (token === undefined){
      const token = uuidv4()
      res.cookie('shortenAppToken', token)
    }

    const created = shortenLink(longLink, token)

    res.json({ short: created.short })
  }
  else res.json({ message: 'Error: set correct link property'})
})

module.exports = router;
