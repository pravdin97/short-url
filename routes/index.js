var express = require('express');
var router = express.Router();
const uuidv4 = require('uuid/v4');
const Models = require('../db/db')

const LINKSIZE = process.env.LINKSIZE || 8

let cache = {

}

/**
 * Поиск объекта, содержащего информацию о ссылке
 * @param shortLink короткая ссылка
 * @returns объект, содержащих информацию о ссылке
 */
async function find(shortLink) {

  const found = await Models.Link.findOne({
    attributes: ['id', 'long', 'short'],
    where: {
      short: shortLink
    }
  })

  return found
}

/**
 * Поиск по длиннойй ссылке объекта, содержащего информацию о ссылке
 * @param longLink длинная ссылка
 * @returns объект, содержащих информацию о ссылке
 */
async function findByLongLink(longLink, user) {
  const found = await Models.Link.findOne({
    attributes: ['id', 'long', 'short'],
    where: {
      short: longLink,
      owner: user
    }
  })

  return found
}

/**
 * Поиск всех ссылок, которые создавал пользователь
 * @param owner идентификатор пользователя
 * @returns массив объектов, содержащих информацию о ссылках 
 */
async function findUserLinks(owner) {
  let result = []
  const links = await Models.Link.findAll({
    attributes: ['id', 'long', 'short', 'createdAt'],
    where: {
      owner: owner
    }
  })

  for (let i = 0; i < links.length; i++) {
    const count = await Models.Visit.findAll({
      attributes: [[Models.sequelize.fn('COUNT', Models.sequelize.col('id')), 'visits']],
      where: {
        link_id: links[i].dataValues.id
      }
    })
    links[i].dataValues.visits = count[0].dataValues.visits
    result.push(links[i].dataValues)
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
async function shortenLink(link, owner) {
  // если этот пользователь уже создал короткую ссылку для этой длинной ссылки
  const createdYet = await findByLongLink(link, owner)
  if (createdYet !== null)
    // вернем существующий объект
    return createdYet

  const shortLink = generate(LINKSIZE)

  const created = await Models.Link.create({
    long: link,
    short: shortLink,
    owner: owner
  })

  cache[shortLink] = created.dataValues

  return created
}

/**
 * Занесение записи о посещении ссылки в базу данных
 * @param linkObject объект, содержащий информацию о ссылке
 */
function visitLink(linkObject) {
  const id = linkObject.id

  if (id !== undefined) {
    Models.Visit.create({
      link_id: id
    }).then(v => {
      console.log(v)
    })
  }
}

/**
 * Получение информации о ссылке, созданной пользователем
 */
async function getInfoAboutUserLinks(user, link, options) {
  let result = {}
  
  const linkObject = await Models.Link.findOne({
    attributes: ['id', 'long', 'short', 'createdAt'],
    where: {
      short: link,
      owner: user
    }
  })
  if (linkObject == null)
    return "There are no this link or this link is not your one"
  
  result = linkObject.dataValues

  // статистика за день
  if (options.day === true) {
    const dayAgo = new Date()
    dayAgo.setDate(dayAgo.getDate() - 1)

    const count = await Models.Visit.findAll({
      attributes: [[Models.sequelize.fn('COUNT', Models.sequelize.col('id')), 'visits']],
      where: {
        link_id: result.id,
        createdAt: {
          [Models.op.between]: [dayAgo, new Date()]
        }
      }
    })
    result.perDay = count[0].dataValues.visits
  }
  // статистика за месяц
  if (options.month === true) {
    const monthAgo = new Date()
    monthAgo.setMonth(monthAgo.getMonth() - 1)

    const count = await Models.Visit.findAll({
      attributes: [[Models.sequelize.fn('COUNT', Models.sequelize.col('id')), 'visits']],
      where: {
        link_id: result.id,
        createdAt: { 
          [Models.op.between]: [monthAgo, new Date()]
        }
      }
    })
    result.perMonth = count[0].dataValues.visits
  }

  return result
}
/**
 * Скорректировать длинную ссылку
 * @param link длинная ссылка
 */
function correctLink(link) {
  if (link.substr(0, 7) !== 'http://' && link.substr(0, 8) !== 'https://')
    link = 'http://' + link
  return link
}

/**
 * Переход по ссылке
 * @param короткая ссылка
 */
router.get('/:short', async (req, res) => {
  const short = req.params.short
  
  // ищем в кэше
  let linkObject = cache[short]
  
  // если нет, то обращаемся в бд
  if (linkObject === undefined) {
    linkObject = await find(short)

    // и добавляем в кэш, если такая ссылка существует
    if (linkObject !== null)
      cache[short] = linkObject.dataValues
  }

  if (linkObject !== null) {
    visitLink(linkObject)
    res.redirect(linkObject.long)
  }
  else res.json({ message: 'Error: invalid link' })
})

/**
 * Создание новой короткой ссылки 
 * @param link длинная ссылка, которую неоходимо укоротить
 */
router.get('/', async (req, res) => {
  if (req.query.link !== undefined && req.query.link !== "") {
    let longLink = req.query.link
    let token = req.cookies.shortenAppToken
    
    if (token === undefined){
      token = uuidv4()
      res.cookie('shortenAppToken', token)
    }

    longLink = correctLink(longLink)
    const created = await shortenLink(longLink, token)

    res.json({ short: created.short })
  }
  else res.json({ message: 'Error: set correct link property'})
})

/**
 * Статистика посещений
 * @param link короткая сслыка, для которой необходима статистика
 * @param day искаль ли количество посещений за день. true/false
 * @param month искаль ли количество посещений за месяц. true/false
 */
router.get('/info/stat', async (req, res) => {
  if (req.query.link !== undefined && req.query.link !== "") {
    const link = req.query.link
    const user = req.cookies.shortenAppToken
    
    const day = (req.query.day === 'true')
    const month = (req.query.month === 'true')

    if (user !== undefined) {
      const result = await getInfoAboutUserLinks(user, link, {
        day: day,
        month: month
      })
      res.json({result})
    }
    else res.json({result: 'Error: you haven\'t shorten any links'})
  }
  else res.json({result: 'Error: set link'})
})

/**
 * Получаем список всех ссылок пользователя
 * пользователь определяется по токену из куки
 */
router.get('/info/mylinks', async (req, res) => {
  const tokenFromCookies = req.cookies.shortenAppToken
  if (tokenFromCookies !== undefined){
    const ownerLinks = await findUserLinks(tokenFromCookies)
    res.json({
      mylinks: ownerLinks
    })
  }
  else res.json({ message: 'You haven\'t shorten any links'})
})

module.exports = router;
