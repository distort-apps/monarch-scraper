const { chromium } = require('playwright');
const fs = require('fs');

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

      eventDetails.push({ title, date: formattedDate, time, location, price, image, buyNowLink });
    });

    return eventDetails;
  });

  // Log the extracted events to the console
  console.log('Extracted events:', JSON.stringify(events, null, 2));

  // Save the extracted events to a JSON file
  fs.writeFileSync('events.json', JSON.stringify(events, null, 2));

  // Close the browser
  await browser.close();
})();
