const { chromium } = require('playwright');
const fs = require('fs');
const cheerio = require('cheerio');

const formatDateStringForMongoDB = (dateString) => {
  const currentYear = new Date().getFullYear();
  const date = new Date(`${dateString} ${currentYear}`);

  // Convert date to ISO string
  let isoString = date.toISOString();

  let datePart = isoString.split('T')[0]; // Separates date from time
  let timePart = '00:00:00.000';
  let timezoneOffset = '+00:00'; // Adjust if you need a different timezone

  return `${datePart}T${timePart}${timezoneOffset}`;
};

const processExcerpt = (html, link) => {
  if (!html) {
    return '';
  }

  const $ = cheerio.load(html);
  let formattedExcerpt = '';

  $('p').each((i, el) => {
    let paragraph = $.html(el);

    // Find all occurrences of sequences of "······"
    paragraph = paragraph.replace(/······+/g, (match) => {
      if (match.length > 26) {
        return '··························';
      }
      return match;
    });

    formattedExcerpt += paragraph;
  });

  if (link) {
    formattedExcerpt += `<br><br><ul><li><a href='${link}'>BUY TICKETS</a></li></ul>`;
  }

  return formattedExcerpt;
};

const genreKeywords = {
  'black metal': ['black metal'],
  metal: ['metal'],
  'nu metal': ['nu metal'],
  punk: ['punk'],
  'post punk': ['post punk', 'post-punk', 'post - punk'],
  'stoner rock': ['stoner rock'],
  'post rock': ['post rock', 'post-rock', 'post - rock'],
  rock: ['rock'],
  edm: ['edm'],
  synth: ['synth'],
  industrial: ['industrial'],
  pop: ['pop'],
  'hip-hop': ['hip-hop', 'hip hop'],
  oi: ['oi'],
  emo: ['emo'],
  'pop up': ['pop up'],
  deathcore: ['deathcore'],
  thrash: ['thrash'],
  other: ['other'] // fallback category
};

const findGenre = (text) => {
  text = text.toLowerCase();
  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return genre;
    }
  }
  return '¯\\_(ツ)_/¯';
};

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://thebrooklynmonarch.com/shows');

  // Wait for the iframe to load
  const iframeElement = await page.waitForSelector('iframe.wuksD5', { timeout: 30000 });
  const iframe = await iframeElement.contentFrame();

  // Wait for the event list widget to be created within the iframe
  await iframe.waitForSelector('#dice-event-list-widget', { timeout: 30000 });

  // Evaluate the iframe to ensure the JavaScript content is fully loaded
  await iframe.evaluate(() => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const widget = document.getElementById('dice-event-list-widget');
        if (widget && widget.innerHTML.length > 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  });

  // Function to load more events by clicking the "Load more" button
  const loadMoreEvents = async () => {
    let loadMoreVisible = true;
    while (loadMoreVisible) {
      try {
        await iframe.click('.dice_load-more');
        await page.waitForTimeout(5000); // wait for more events to load
      } catch (error) {
        loadMoreVisible = false; // no more "Load more" button found
      }
    }
  };

  // Load all events
  await loadMoreEvents();

  // Extract event details
  const events = await iframe.evaluate(() => {
    const formatDateStringForMongoDB = (dateString) => {
      const currentYear = new Date().getFullYear();
      const date = new Date(`${dateString} ${currentYear}`);

      // Convert date to ISO string
      let isoString = date.toISOString();

      let datePart = isoString.split('T')[0]; // Separates date from time
      let timePart = '00:00:00.000';
      let timezoneOffset = '+00:00'; // Adjust if you need a different timezone

      return `${datePart}T${timePart}${timezoneOffset}`;
    };

    const formatDateTime = (dateTimeStr) => {
      const [dayPart, timePart] = dateTimeStr.split(' ― ');
      const [dayOfWeek, day, month] = dayPart.split(' ');

      if (!day || !month) {
        return { formattedDate: '', time: '' };
      }

      const monthMapping = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
        'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };

      const monthNum = monthMapping[month];
      const formattedDate = formatDateStringForMongoDB(`${month} ${day}`);

      return {
        formattedDate,
        time: timePart ? timePart.trim() : ''
      };
    };

    const eventElements = document.querySelectorAll('article.sc-olbas');
    const eventDetails = [];

    eventElements.forEach(eventEl => {
      const titleEl = eventEl.querySelector('.dice_event-title');
      const dateTimeEl = eventEl.querySelector('.sc-hiMGwR');
      const locationEl = eventEl.querySelector('.sc-GVOUr');
      const priceEl = eventEl.querySelector('.dice_price');
      const imageEl = eventEl.querySelector('img');
      const titleLinkEl = eventEl.querySelector('a.sc-lbOyJj.jCliBg.dice_event-title');

      const title = titleEl ? titleEl.textContent.trim() : '';
      const dateTime = dateTimeEl ? dateTimeEl.textContent.trim() : '';
      const location = locationEl ? locationEl.textContent.trim() : '';
      const price = priceEl ? priceEl.textContent.trim() : '';
      const image = imageEl ? imageEl.src : '';
      const buyNowLink = titleLinkEl ? titleLinkEl.href : '';

      const { formattedDate, time } = formatDateTime(dateTime);

      eventDetails.push({ title, date: formattedDate, genre: 'gig', time: time || '', location, price, image, buyNowLink });
    });

    return eventDetails;
  });

  // Log the extracted events to the console
  console.log('Extracted events:', JSON.stringify(events, null, 2));

  // Extract "About" section for each event
  for (const event of events) {
    if (event.buyNowLink) {
      const eventPage = await browser.newPage();
      try {
        await eventPage.goto(event.buyNowLink, { waitUntil: 'domcontentloaded' });
        const aboutSectionHtml = await eventPage.evaluate(() => {
          const aboutEl = document.querySelector('.EventDetailsAbout__Text-sc-6411bf4-1.bNbath');
          return aboutEl ? aboutEl.innerHTML : '';
        });

        event.excerpt = processExcerpt(aboutSectionHtml, event.buyNowLink);
        event.genre = findGenre(event.excerpt || ''); // Determine genre based on the excerpt
      } catch (error) {
        console.error(`Failed to extract about section for event: ${event.title}`, error);
      } finally {
        await eventPage.close();
      }
    }
  }

  // Save the extracted events to a JSON file
  fs.writeFileSync('events.json', JSON.stringify(events, null, 2));

  // Close the browser
  await browser.close();
})();
