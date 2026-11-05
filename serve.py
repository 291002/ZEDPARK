# Static server for the dashboard that tells the browser never to cache, so edits show up on a normal refresh.
import http.server, functools, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('', 5185), functools.partial(NoCache, directory=os.path.dirname(os.path.abspath(__file__)))).serve_forever()
