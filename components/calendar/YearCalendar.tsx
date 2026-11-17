import { calendarYear, schedule, weekdays } from "../../lib/calendar";

export function YearCalendar() {
  return (
    <div className="year-grid" aria-label={`${calendarYear} month grids`}>
      {schedule.map(({ id, month, firstDay, lastDay, publishDate }) => {
        const weeks = Math.ceil((firstDay + lastDay) / 7);
        return (
          <table key={id} className="month-grid">
            <caption>{month}</caption>
            <thead>
              <tr>{weekdays.map((day) => <th key={day} scope="col">{day}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: weeks }, (_, week) => (
                <tr key={week}>
                  {weekdays.map((weekday, index) => {
                    const day = week * 7 + index - firstDay + 1;
                    if (day < 1 || day > lastDay) return <td key={weekday} />;
                    return (
                      <td key={weekday}>
                        {day === lastDay ? (
                          <time className="publication-day" dateTime={publishDate}>
                            {day}<span className="sr-only">, publication day</span>
                          </time>
                        ) : day}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
