/**
 * The in-app page the coach was on before this one, for the feedback form's
 * "page" field. document.referrer can't do this: moving between pages in
 * the app never loads a new document, so the referrer stays empty.
 */
let current = "";
let previous = "";

export function notePage(pathname: string) {
  if (pathname === current) return;
  previous = current;
  current = pathname;
}

export const previousPage = () => previous;
