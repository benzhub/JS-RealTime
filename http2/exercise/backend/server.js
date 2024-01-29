import http2 from "http2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import handler from "serve-handler";
import nanobuffer from "nanobuffer";

let connections = [];

const msg = new nanobuffer(50);
const getMsgs = () => Array.from(msg).reverse();

msg.push({
  user: "brian",
  text: "hi",
  time: Date.now(),
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = http2.createSecureServer({
  cert: fs.readFileSync(path.join(__dirname, "/../server.crt")),
  key: fs.readFileSync(path.join(__dirname, "/../key.pem")),
});

server.on("stream", (stream, headers) => {
  const method = headers[":method"];
  const path = headers[":path"];

  if (path === "/msgs" && method === "GET") {
    console.log("Connected stream " + stream.id);
    stream.respond({
      ":status": 200,
      "content-type": "application/json; charset=utf-8", // Fix typo here
    });
    stream.write(JSON.stringify({ msgs: getMsgs() })); // Move this line here
    connections.push(stream)
    // stream.end(); // End the response
    stream.on("close", () => {
      console.log("Disconnected " + stream.id);
      connections = connections.filter(s => s !== stream);
    });
  }
});

server.on("request", async (req, res) => {
  const path = req.headers[":path"];
  const method = req.headers[":method"];

  if (path !== "/msgs") {
    return handler(req, res, {
      public: "./frontend",
    });
  } else if (method === "POST") {
    try {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const data = Buffer.concat(buffers).toString();
      const { user, text } = JSON.parse(data);

      // Add the new message to the queue
      msg.push({ user, text, time: Date.now() });
      
      // Respond with success
      res.writeHead(200, { "Content-Type": "text/plain" });
      // res.end("Message received successfully.");
      connections.forEach((stream)=>{
        stream.write(JSON.stringify({ msg: getMsgs() }))
      })
    } catch (error) {
      // Respond with error
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Error processing the message.");
    }
  }
});

const port = process.env.PORT || 8080;
server.listen(port, () =>
  console.log(`Server running at https://localhost:${port}`)
);
