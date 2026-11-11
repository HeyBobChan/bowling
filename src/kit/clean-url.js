// Games are linked without a suffix (/kids/chana). Older links and printed QR codes end
// in .html and still load; show the short address without a reload, keeping ?room and #host.
const { pathname, search, hash } = location;
if (pathname.endsWith('.html')) history.replaceState(history.state, '', pathname.slice(0, -5) + search + hash);
