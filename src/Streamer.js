import StaticServer from '@dr.pogodin/react-native-static-server';

import ReactNativeBlobUtil from 'react-native-blob-util'

import { unzip } from 'react-native-zip-archive';

const Dirs = ReactNativeBlobUtil.fs.dirs;

if (!global.Blob) {
  global.Blob = ReactNativeBlobUtil.polyfill.Blob;
}

const Uri = require('epubjs/lib/utils/url');

class EpubStreamer {
  constructor(opts) {
    opts = opts || {};
    this.port = opts.port || '3' + Math.round(Math.random() * 1000);
    this.root = opts.root || 'www';

    this.serverOrigin = 'file://';

    this.urls = [];
    this.locals = [];
    this.paths = [];

    this.started = false;
    this.server = undefined;
  }

  setup() {
    // Add the directory
    return ReactNativeBlobUtil.fs
      .exists(`${Dirs.DocumentDir}/${this.root}`)
      .then((exists) => {
        if (!exists) {
          return ReactNativeBlobUtil.fs.mkdir(`${Dirs.DocumentDir}/${this.root}`);
        }
      })
      .then(() => {
        return new StaticServer(this.port, this.root, { localOnly: true });
      })
      .catch((e) => {
        console.error(e);
      });
  }

  start() {
    this.started = true;
    return this.setup()
      .then((server) => {
        this.server = server;
        return this.server.start();
      })
      .then((url) => {
        this.serverOrigin = url;
        return url;
      });
  }

  stop() {
    this.started = false;
    if (this.server) {
      this.server.stop();
    }
  }

  kill() {
    this.started = false;
    if (this.server) {
      this.server.kill();
    }
  }

  add(bookUrl) {
    // let uri = new Uri(bookUrl);
    const filename = this.filename(bookUrl);

    return ReactNativeBlobUtil.config({
      fileCache: true,
      path: Dirs.DocumentDir + '/' + filename,
    })
      .fetch('GET', bookUrl)
      .then((res) => {
        const sourcePath = res.path();
        const targetPath = `${Dirs.DocumentDir}/${this.root}/${filename}`;
        const url = `${this.serverOrigin}/${filename}/`;

        return unzip(sourcePath, targetPath).then((path) => {
          this.urls.push(bookUrl);
          this.locals.push(url);
          this.paths.push(path);

          // res.flush();

          return url;
        });
      });
  }

  check(bookUrl) {
    const filename = this.filename(bookUrl);
    const targetPath = `${Dirs.DocumentDir}/${this.root}/${filename}`;

    return ReactNativeBlobUtil.fs.exists(targetPath);
  }

  get(bookUrl) {
    return this.check(bookUrl).then((exists) => {
      if (exists) {
        const filename = this.filename(bookUrl);
        const url = `${this.serverOrigin}/${filename}/`;
        return url;
      }

      return this.add(bookUrl);
    });
  }

  filename(bookUrl) {
    const uri = new Uri(bookUrl);
    let finalFileName;
    if (uri.filename.indexOf('?') > -1) {
      finalFileName = uri.filename.split('?')[0].replace('.epub', '');
    } else {
      finalFileName = uri.filename.replace('.epub', '');
    }
    return finalFileName;
  }

  remove(path) {
    return ReactNativeBlobUtil.fs
      .lstat(path)
      .then((stats) => {
        const index = this.paths.indexOf(path);
        this.paths.splice(index, 1);
        this.urls.splice(index, 1);
        this.locals.splice(index, 1);
      })
      .catch((err) => {});
  }

  clean() {
    this.paths.forEach((path) => {
      this.remove(path);
    });
  }
}

export default EpubStreamer;
