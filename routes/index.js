var express = require('express');
var router = express.Router();
const uuidv4 = require('uuid/v4');
const Models = require('../db/db')

const LINKSIZE = process.env.LINKSIZE || 8

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

router.get('/:short', async (req, res) => {
  const short = req.params.short
  
  // получаем список всех ссылок пользователя
  // пользователь определяется по токену из куки
  if (short === "mylinks") {
    const tokenFromCookies = req.cookies.shortenAppToken
      if (tokenFromCookies !== undefined){
        const ownerLinks = await findUserLinks(tokenFromCookies)
        res.json({
          mylinks: ownerLinks
        })
      }
      else res.json({ message: 'You haven\'t shorten any links'})
  }

  // переход по короткой ссылке
  else {
    const linkObject = await find(short)
    if (linkObject !== null) {
      linkObject.count++
      visitLink(linkObject)
      res.redirect(linkObject.long)
    }
    else res.json({ message: 'Error: invalid link' })
  }
})

/**
 * Создание новой короткой ссылки 
 * @param link длинная ссылка, которую неоходимо укоротить
 */
router.get('/', async (req, res) => {
  if (req.query.link !== undefined && req.query.link !== "") {
    const longLink = req.query.link
    let token = req.cookies.shortenAppToken
    
    if (token === undefined){
      token = uuidv4()
      res.cookie('shortenAppToken', token)
    }

    const created = shortenLink(longLink, token)

    res.json({ short: created.short })
  }
  else res.json({ message: 'Error: set correct link property'})
})

/**
 * Статистика посещений
 * @param link короткая сслыка, для которой необходима статистика
 */
router.get('/info/stat', async (req, res) => {
  if (req.query.link !== undefined && req.query.link !== "") {
    const link = req.query.link
    const result = await getInfoAboutUserLinks(req.cookies.shortenAppToken, link, {
      day: true,
      month: true
    })
    res.json({result})
  }
})

module.exports = router;
