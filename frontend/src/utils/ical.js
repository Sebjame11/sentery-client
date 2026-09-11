export function exportMeetingICS(prospect) {
    const now = new Date();
    const dtStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0);
    const dtEnd = new Date(dtStart.getTime() + 30 * 60000);
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Sentery//Meeting//EN',
        'BEGIN:VEVENT',
        'DTSTART:' + fmt(dtStart),
        'DTEND:' + fmt(dtEnd),
        'SUMMARY:Meeting with ' + prospect.name,
        'DESCRIPTION:' + (prospect.notes || ''),
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'meeting-' + prospect.name.toLowerCase().replace(/\s+/g, '-') + '.ics';
    a.click();
}
