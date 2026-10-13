// Fixture: near-identical to DateRange — same param-property fields, same method.
export class TimeRange {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}

  contains(minute: string): boolean {
    return minute >= this.from && minute <= this.to;
  }
}
