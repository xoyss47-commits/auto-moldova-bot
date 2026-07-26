const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/default');
const scraperService = require('../backend/services/scraperService');
const calculatorService = require('../backend/services/calculatorService');

let bot = null;

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getWelcomeInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '🚗 Открыть Автокаталог (Mini App)',
          web_app: { url: config.telegram.webAppUrl },
        },
      ],
      [
        {
          text: '📞 Связаться с менеджером',
          url: `https://t.me/${config.telegram.managerContact.replace('@', '')}`,
        },
      ],
      [
        {
          text: '🔍 Найти авто сейчас (в чате)',
          callback_data: 'action_start_search',
        },
      ],
    ],
  };
}

function getSearchResultInlineKeyboard(vehicleIndex) {
  return {
    inline_keyboard: [
      [
        {
          text: '🚗 Открыть в каталоге (Mini App)',
          web_app: { url: config.telegram.webAppUrl },
        },
      ],
      [
        {
          text: '📞 Заказать / Консультация',
          url: `https://t.me/${config.telegram.managerContact.replace('@', '')}`,
        },
      ],
      [
        {
          text: '📋 Запросить отчет Carfax',
          callback_data: `action_report_${vehicleIndex}`,
        },
      ],
    ],
  };
}

function formatPrice(price) {
  return calculatorService.formatPriceUsd(price);
}

function buildVehicleCaption(vehicle, calculation) {
  const finalPriceStr = formatPrice(calculation.finalMoldovaPriceUsd);
  const auctionPriceStr = formatPrice(calculation.auctionPrice);
  const logisticsStr = formatPrice(calculation.deliveryAndLogistics);
  const customsStr = formatPrice(calculation.customsTaxMoldova);

  const fuel = vehicle.fuelType ? `⛽ <b>Топливо:</b> ${escapeHtml(vehicle.fuelType)}` : '';
  const color = vehicle.color ? `🎨 <b>Цвет:</b> ${escapeHtml(vehicle.color)}` : '';
  const loc = vehicle.location ? `📍 <b>Локация:</b> ${escapeHtml(vehicle.location)}` : '';
  const vin = vehicle.vin ? `🔖 <b>VIN:</b> <code>${escapeHtml(vehicle.vin)}</code>` : '';

  const engineLine = vehicle.engineCc > 0
    ? `🔧 <b>Двигатель:</b> ${vehicle.engineCc.toLocaleString('ru-RU')} см³`
    : '🔋 <b>Электромобиль</b>';

  const lines = [
    `🚗 <b>${escapeHtml(vehicle.title)}</b>`,
    '',
    `📅 <b>Год:</b> ${vehicle.year}`,
    engineLine,
    fuel,
    `🛣️ <b>Пробег:</b> ${escapeHtml(vehicle.mileage)}`,
    color,
    loc,
    vin,
    '',
    '━━━━━━━━━━━━━━━',
    '',
    '🇲🇩 <b>📊 РАСЧЕТ «ПОД КЛЮЧ» В МОЛДОВЕ:</b>',
    '',
    `💰 <b>Цена на аукционе:</b> ${auctionPriceStr}`,
    `🚚 <b>Логистика (США/Европа → РМ):</b> ${logisticsStr}`,
    `📄 <b>Растаможка Молдова:</b> ${customsStr}`,
    '',
    `✅ <b>ИТОГО:</b> <b>${finalPriceStr}</b>`,
    '',
    '▫️ <i>Включая НДС 20%, комиссию сервиса и оформление</i>',
  ].filter(Boolean);

  return lines.join('\n');
}

async function sendVehicleMessage(chatId, vehicle, vehicleIndex) {
  let calculation;
  let caption;
  let replyMarkup;
  try {
    calculation = calculatorService.calculateFinalPrice(
      vehicle.currentBidUsd,
      vehicle.engineCc,
      vehicle.year,
      vehicle.fuelType
    );
    caption = buildVehicleCaption(vehicle, calculation);
    replyMarkup = getSearchResultInlineKeyboard(vehicleIndex).inline_keyboard;
  } catch (buildErr) {
    console.error('[bot] Kart oluşturma hatası:', buildErr.message);
    try {
      await bot.sendMessage(
        chatId,
        `⚠️ Не удалось сформировать карточку авто. Свяжитесь с менеджером: ${config.telegram.managerContact}`,
        { parse_mode: 'HTML' }
      );
    } catch (_) {}
    return;
  }

  const photo = vehicle.images && vehicle.images.length > 0 ? vehicle.images[0] : null;

  if (photo) {
    try {
      await bot.sendPhoto(chatId, photo, {
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
        has_spoiler: false,
      });
      return;
    } catch (photoErr) {
      console.warn('[bot] sendPhoto FAILED:', photoErr.code || photoErr.message.substring(0, 200), '→ Picsum/Unsplash URL reddedildi, fotosuz gönderiliyor...');
    }
  }

  try {
    await bot.sendMessage(chatId, caption, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
  } catch (textErr) {
    console.error('[bot] sendMessage de FAILED:', textErr.code || textErr.message.substring(0, 200));
    try {
      await bot.sendMessage(
        chatId,
        `⚠️ Ошибка отправки карточки авто. Свяжитесь с менеджером: ${config.telegram.managerContact}`,
        { parse_mode: 'HTML' }
      );
    } catch (_) {}
  }
}

async function handleSearchFlow(chatId, searchQuery, replyToId = null) {
  let loadingMsg = null;
  try {
    loadingMsg = await bot.sendMessage(
      chatId,
      '🔎 Ищу подходящие варианты по аукционам…\nПожалуйста, подождите ⏳',
      {
        reply_markup: { remove_keyboard: true },
        ...(replyToId ? { reply_to_message_id: replyToId } : {}),
      }
    );
  } catch (_) {}

  try {
    const vehicles = await scraperService.searchVehicles(searchQuery);

    if (loadingMsg) {
      await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    }

    if (!vehicles || vehicles.length === 0) {
      await bot.sendMessage(
        chatId,
        '😔 Ничего не найдено по вашему запросу.\n\n' +
        '💡 <b>Попробуйте:</b>\n' +
        '• Изменить марку/модель\n' +
        '• Убрать лишние слова из запроса\n' +
        '• Открыть полный каталог в Mini App 👇\n\n' +
        `Или напишите нам ${config.telegram.managerContact} — подберём вариант вручную!`,
        {
          parse_mode: 'HTML',
          reply_markup: getWelcomeInlineKeyboard(),
        }
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      `✅ <b>Найдено ${vehicles.length} вариантов</b> по запросу: <i>${escapeHtml(searchQuery)}</i>\n\n` +
      'Вот лучшие предложения с расчетом стоимости «под ключ» в Молдове 👇',
      {
        parse_mode: 'HTML',
        reply_markup: getWelcomeInlineKeyboard(),
        ...(replyToId ? { reply_to_message_id: replyToId } : {}),
      }
    );

    for (let i = 0; i < vehicles.length; i++) {
      await sendVehicleMessage(chatId, vehicles[i], i);
      if (i < vehicles.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    await bot.sendMessage(
      chatId,
      '💡 <b>Полезно знать:</b>\n\n' +
      '• Откройте 🚗 <b>Автокаталог (Mini App)</b> — там удобные фильтры по году, двигателю, бюджету и сортировки\n' +
      '• Цены предварительные (ориентировочные) — окончательная стоимость после точной оценки менеджера\n' +
      `• По всем вопросам: ${config.telegram.managerContact}`,
      {
        parse_mode: 'HTML',
        reply_markup: getWelcomeInlineKeyboard(),
      }
    );
  } catch (err) {
    console.error('[bot] Ошибка поиска:', err.message || err);
    if (loadingMsg) {
      await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    }
    try {
      await bot.sendMessage(
        chatId,
        '⚠️ Произошла ошибка при поиске. Пожалуйста, попробуйте позже или свяжитесь с менеджером.',
        {
          parse_mode: 'HTML',
          reply_markup: getWelcomeInlineKeyboard(),
        }
      );
    } catch (_) {}
  }
}

let awaitingSearchQuery = new Set();

function initBot() {
  if (!config.telegram.token) {
    throw new Error('TELEGRAM_BOT_TOKEN не указан в переменных окружения (.env)!');
  }

  bot = new TelegramBot(config.telegram.token, {
    polling: false,
  });

  if (config.telegram.polling) {
    bot.startPolling({ restart: true }).catch((err) => {
      console.error('[bot] ❌ Ошибка запуска polling:', err.code, err.message);
    });
  }

  // ========= /start =========
  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = msg.chat.id;
      awaitingSearchQuery.delete(String(chatId));

      const welcome = [
        'Привет! 👋',
        '',
        '🚗 Я помогу вам <b>подобрать и рассчитать полную стоимость</b> автомобиля из США/Европы с доставкой и растаможкой <b>«под ключ» в Молдове</b> 🇲🇩.',
        '',
        '📦 <b>Что входит в цену:</b>',
        '  ✅ Стоимость авто на аукционе',
        '  ✅ Логистика до Молдовы ($2 200)',
        '  ✅ Растаможка и НДС 20%',
        '  ✅ Комиссия сервиса и оформление',
        '',
        '👇 <b>Выберите действие:</b>',
        '',
        '• Откройте 🚗 <b>Автокаталог</b> (Mini App) — удобный поиск с фильтрами и сортировками',
        '• Или напишите здесь марку и модель авто (например: <i>Mercedes CLS 63</i>, <i>BMW X5</i>, <i>Audi Q7</i>)',
      ].join('\n');

      await bot.sendMessage(chatId, welcome, {
        parse_mode: 'HTML',
        reply_markup: getWelcomeInlineKeyboard(),
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.error('[bot] /start error:', err.message);
    }
  });

  // ========= Help =========
  bot.onText(/\/help/, async (msg) => {
    try {
      const chatId = msg.chat.id;
      await bot.sendMessage(
        chatId,
        '📖 <b>Помощь по боту</b>\n\n' +
        '🚗 <b>Как пользоваться:</b>\n' +
        '1. Нажмите кнопку «🚗 Открыть Автокаталог» — запустится Mini App внутри Telegram\n' +
        '2. Или просто напишите сюда марку и модель (например: <b>BMW M5 F90</b>)\n\n' +
        '💬 <b>Контакты:</b>\n' +
        `Менеджер: ${config.telegram.managerContact}\n\n` +
        '⚙️ Команды:\n' +
        ' /start - Перезапустить бота\n' +
        ' /help - Показать справку',
        { parse_mode: 'HTML', reply_markup: getWelcomeInlineKeyboard() }
      );
    } catch (err) {
      console.error('[bot] /help error:', err.message);
    }
  });

  // ========= Callback queries =========
  bot.on('callback_query', async (cb) => {
    try {
      const chatId = cb.message?.chat?.id;
      const data = cb.data || '';
      const userId = cb.from?.id;

      if (data === 'action_start_search') {
        if (chatId) awaitingSearchQuery.add(String(chatId));
        await bot.answerCallbackQuery(cb.id, { text: '✏️ Введите марку/модель авто' });
        if (chatId) {
          await bot.sendMessage(
            chatId,
            '✏️ <b>Введите марку и модель автомобиля для поиска:</b>\n\n' +
            '<i>Например: Audi Q7, Toyota Camry, Range Rover Sport, Tesla Model S</i>',
            { parse_mode: 'HTML' }
          );
        }
        return;
      }

      if (data.startsWith('action_report_')) {
        await bot.answerCallbackQuery(cb.id, {
          text: '✅ Заявка принята! Менеджер свяжется с вами в ближайшее время.',
          show_alert: true,
        });
        if (chatId) {
          try {
            await bot.sendMessage(
              chatId,
              '📋 <b>Заявка на отчет Carfax / AutoCheck</b>\n\n' +
              'Спасибо за обращение! 🙌\n' +
              `Менеджер ${config.telegram.managerContact} свяжется с вами в течение 15 минут и предоставит:\n\n` +
              '  • Историю владения\n' +
              '  • Данные о ДТП\n' +
              '  • Пробег по сервисам\n' +
              '  • Отчет о повреждениях',
              { parse_mode: 'HTML' }
            );
          } catch (_) {}
        }

        try {
          const managerClean = config.telegram.managerContact.replace('@', '');
          await bot.sendMessage(
            managerClean,
            `📋 <b>НОВАЯ ЗАЯВКА на отчет Carfax</b>\n\nОт пользователя: ${cb.from?.username ? '@' + cb.from.username : 'ID ' + cb.from?.id}\nИмя: ${escapeHtml(cb.from?.first_name || '')} ${escapeHtml(cb.from?.last_name || '')}`,
            { parse_mode: 'HTML' }
          ).catch(() => {});
        } catch (_) {}
        return;
      }

      await bot.answerCallbackQuery(cb.id).catch(() => {});
    } catch (err) {
      console.error('[bot] callback_query error:', err.message);
    }
  });

  // ========= Plain messages =========
  bot.on('message', async (msg) => {
    try {
      if (!msg.text) return;
      const text = msg.text.trim();
      const chatId = msg.chat.id;
      const chatStr = String(chatId);

      if (text.startsWith('/')) return;

      if (text.length < 2) {
        await bot.sendMessage(
          chatId,
          '⚠️ Слишком короткий запрос. Введите хотя бы марку автомобиля (например: <b>BMW</b>).',
          { parse_mode: 'HTML' }
        );
        return;
      }

      awaitingSearchQuery.delete(chatStr);
      await handleSearchFlow(chatId, text, msg.message_id);
    } catch (err) {
      console.error('[bot] Обработка сообщения:', err.message);
    }
  });

  // ========= WebApp data =========
  bot.on('web_app_data', async (msg) => {
    try {
      const chatId = msg.chat.id;
      const data = msg.web_app_data?.data;
      console.log('[bot] WebApp data received:', data);
      await bot.sendMessage(
        chatId,
        '✅ Данные из каталога получены! Мы обработаем ваш запрос и менеджер свяжется с вами в ближайшее время.\n\n' +
        `Если у вас возникли вопросы, пишите: ${config.telegram.managerContact}`,
        { parse_mode: 'HTML', reply_markup: getWelcomeInlineKeyboard() }
      );
    } catch (err) {
      console.error('[bot] web_app_data error:', err.message);
    }
  });

  // ========= Errors =========
  bot.on('polling_error', (err) => {
    if (err.code === 'EFATAL' || String(err.message).includes('ETELEGRAM')) {
      console.error('[bot] 🔴 Fatal polling error:', err.code, err.message);
    } else {
      console.warn('[bot] ⚠️ Polling:', err.code, String(err.message).substring(0, 120));
    }
  });

  bot.on('error', (err) => {
    console.error('[bot] ❌ Ошибка бота:', err.message);
  });

  console.log('[bot] ✅ Telegram Bot инициализирован.');
  return bot;
}

function getBotInstance() {
  return bot;
}

module.exports = {
  initBot,
  getBotInstance,
};
