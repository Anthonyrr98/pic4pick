// JavaScriptCore has no DOM URL object. Foundation supplies URL parsing, while
// this small interface lets the unchanged shared media helpers run on iOS.
declare const __pic4pickParseURL: (value: string, base: string) => any;
if (typeof globalThis.URL === 'undefined') {
  (globalThis as any).URL = class {
    protocol: string;
    hostname: string;
    host: string;
    pathname: string;
    hash: string;
    searchParams: any;
    constructor(value: string, base = 'http://localhost') {
      const parsed = __pic4pickParseURL(String(value), String(base));
      if (!parsed) throw new Error('Invalid URL');
      this.protocol = parsed.protocol; this.hostname = parsed.hostname; this.host = parsed.host;
      this.pathname = parsed.pathname; this.hash = parsed.hash;
      let pairs: string[][] = parsed.query;
      this.searchParams = {
        get(name: string) { return pairs.find(pair => pair[0] === name)?.[1] ?? null; },
        delete(name: string) { pairs = pairs.filter(pair => pair[0] !== name); },
        set(name: string, value: string) { pairs = pairs.filter(pair => pair[0] !== name); pairs.push([name, String(value)]); },
        toString() { return pairs.map(pair => pair.map(encodeURIComponent).join('=')).join('&'); },
      };
    }
    get origin() { return `${this.protocol}//${this.host}`; }
    toString() { const query = this.searchParams.toString(); return this.origin + this.pathname + (query ? '?' + query : '') + this.hash; }
    get href() { return this.toString(); }
  };
}
