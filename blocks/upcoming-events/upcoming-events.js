export default function decorate(block) {
  const rows = [...block.children];

  if (rows.length < 2) {
    console.warn('Upcoming Events: expected at least 2 rows.');
    return;
  }

  const imageRow = rows[0];
  const dateRow = rows[1];

  const imageCells = [...imageRow.children];
  const dateCells = [...dateRow.children];

  const eventCount = Math.min(imageCells.length, dateCells.length);

  if (!eventCount) {
    console.warn('Upcoming Events: no events found.');
    return;
  }

  const events = [];

  for (let i = 0; i < eventCount; i += 1) {
    const imageCell = imageCells[i];
    const dateCell = dateCells[i];

    const image = imageCell.querySelector('img');

    if (!image) {
      console.warn(`Upcoming Events: missing image for event ${i + 1}.`);
      continue;
    }

    const link = dateCell.querySelector('a');

    const event = document.createElement('a');

    event.className = 'upcoming-events-card';

    if (link) {
      event.href = link.href;
    } else {
      event.href = '#';
    }

    const eventImage = document.createElement('img');

    eventImage.src = image.src;
    eventImage.alt = image.alt || '';

    const eventDate = document.createElement('span');

    eventDate.className = 'upcoming-events-date';
    eventDate.textContent = dateCell.textContent.trim();

    event.append(eventImage, eventDate);

    events.push(event);
  }

  block.replaceChildren(...events);
}