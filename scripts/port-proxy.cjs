const http = require("http");
const net = require("net");

const server = http.createServer((req, res) => {
  const opts = { hostname: "127.0.0.1", port: 5000, path: req.url, method: req.method, headers: req.headers };
  const proxy = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(proxy);
});

server.on("upgrade", (req, socket, head) => {
  const conn = net.connect(5000, "127.0.0.1", () => {
    const reqLine = `${req.method} ${req.url} HTTP/1.1\r\n`;
    const headers = Object.entries(req.headers).map(([k,v]) => `${k}: ${v}`).join("\r\n");
    conn.write(reqLine + headers + "\r\n\r\n");
    if (head && head.length) conn.write(head);
    socket.pipe(conn);
    conn.pipe(socket);
  });
  conn.on("error", () => socket.destroy());
  socket.on("error", () => conn.destroy());
});

server.listen(23636, "0.0.0.0", () => console.log("[Proxy] 23636 -> 5000"));
