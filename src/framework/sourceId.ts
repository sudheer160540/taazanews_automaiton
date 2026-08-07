/**
 * Per-source ID extraction from article URLs.
 */
export function extractSourceId(source: string, url: string): string | undefined {
  if (!url) return undefined;

  switch (source) {
    case "eenadu": {
      // .../0401/126089639 or .../126089639
      const m = url.match(/\/(\d{5,})(?:\/)?$/);
      if (m) return m[1];
      const parts = url.replace(/\?.*$/, "").split("/").filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d{5,}$/.test(parts[i])) return parts[i];
      }
      return undefined;
    }
    case "toi": {
      // .../articleshow/131264680.cms
      const m = url.match(/articleshow\/(\d+)(?:\.cms)?/i);
      if (m) return m[1];
      const cms = url.match(/\/(\d+)\.cms(?:\?.*)?$/i);
      if (cms) return cms[1];
      return undefined;
    }
    case "sakshi": {
      // .../slug-title-2866689
      const m = url.match(/-(\d{5,})(?:\/)?$/);
      if (m) return m[1];
      return undefined;
    }
    case "andhrajyothy":
    case "aj": {
      // ...-1548033.html
      const m = url.match(/-(\d{5,})\.html(?:\?.*)?$/i);
      if (m) return m[1];
      return undefined;
    }
    case "ntv": {
      // ...-1001873.html
      const m = url.match(/-(\d{5,})\.html(?:\?.*)?$/i);
      if (m) return m[1];
      return undefined;
    }
    default:
      return undefined;
  }
}
