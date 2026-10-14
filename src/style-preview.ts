// Keep the trial URL namespace separate from the normal four pages.
export const previewPaths=['/proefstijl','/proefstijl/beabuorren','/proefstijl/elektrolyser','/proefstijl/onderzoek'];
export const isStylePreview=previewPaths.includes(location.pathname);
export const originalPath=isStylePreview?(location.pathname.slice('/proefstijl'.length)||'/'):location.pathname;
export function pageHref(path:string){return isStylePreview?'/proefstijl'+(path==='/'?'':path):path;}
