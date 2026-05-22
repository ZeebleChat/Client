import { useState, useEffect } from 'react';

/**
 * Fetches an attachment via a caller-supplied fetch function (which adds
 * Authorization headers) and returns a temporary blob URL for use in
 * <img>, <video>, <audio>, or <a download> elements.
 *
 * The blob URL is automatically revoked when the component unmounts or
 * when the id changes, preventing memory leaks.
 */
export function useAttachmentBlobUrl(
  id: string | number | null | undefined,
  fetchFn: (id: string | number) => Promise<Response>,
): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (id == null) {
      setBlobUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    fetchFn(id)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  // fetchFn intentionally omitted from deps — it changes reference every render
  // but is a pure function; only re-fetch when id actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(id)]);

  return blobUrl;
}
