// Fixture: class whose fields come ONLY from constructor parameter properties.
export class DateRange {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}

  contains(day: string): boolean {
    return day >= this.from && day <= this.to;
  }
}
