const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;

// OAuth2 client setup
const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate auth URL for user to connect their calendar
function getAuthUrl(userId) {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: userId, // Pass user ID to link on callback
    prompt: 'consent',
  });
}

// Exchange code for tokens and store them
async function getTokensFromCode(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// Create calendar event
async function createCalendarEvent(tokens, eventDetails) {
  try {
    // Set credentials for this user
    oauth2Client.setCredentials(tokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const event = {
      summary: eventDetails.title || 'Localink Booking',
      description: eventDetails.description || 'Booking from Localink',
      start: {
        dateTime: new Date(eventDetails.startTime).toISOString(),
        timeZone: 'Africa/Windhoek',
      },
      end: {
        dateTime: new Date(eventDetails.endTime).toISOString(),
        timeZone: 'Africa/Windhoek',
      },
      location: eventDetails.location || '',
      attendees: eventDetails.attendees || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };
    
    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all',
    });
    
    return result.data;
  } catch (error) {
    console.error('Google Calendar error:', error.message);
    throw error;
  }
}

// Update an existing event
async function updateCalendarEvent(tokens, eventId, eventDetails) {
  try {
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const event = {
      summary: eventDetails.title,
      description: eventDetails.description,
      start: {
        dateTime: new Date(eventDetails.startTime).toISOString(),
        timeZone: 'Africa/Windhoek',
      },
      end: {
        dateTime: new Date(eventDetails.endTime).toISOString(),
        timeZone: 'Africa/Windhoek',
      },
      location: eventDetails.location || '',
    };
    
    const result = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: event,
      sendUpdates: 'all',
    });
    
    return result.data;
  } catch (error) {
    console.error('Update Calendar error:', error.message);
    throw error;
  }
}

// Delete an event (when booking is cancelled)
async function deleteCalendarEvent(tokens, eventId) {
  try {
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendUpdates: 'all',
    });
    
    return { success: true };
  } catch (error) {
    console.error('Delete Calendar error:', error.message);
    throw error;
  }
}

module.exports = {
  oauth2Client,
  getAuthUrl,
  getTokensFromCode,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
};