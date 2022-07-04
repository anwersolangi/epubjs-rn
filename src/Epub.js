import React, { Component } from 'react';

import { Dimensions, AppState } from 'react-native';

import ReactNativeBlobUtil  from "react-native-blob-util";

import AsyncStorage from '@react-native-async-storage/async-storage';

const defaultContentInset = { top: 0, bottom: 32 };

if (!global.Blob) {
  global.Blob = ReactNativeBlobUtil.polyfill.Blob;
}

global.JSZip = global.JSZip || require('jszip');

global.URL = require('epubjs/libs/url/url-polyfill.js');

if (!global.btoa) {
  global.btoa = require('base-64').encode;
}

import ePub, { Layout, EpubCFI } from 'epubjs';

const core = require('epubjs/lib/utils/core');
const Uri = require('epubjs/lib/utils/url');
const Path = require('epubjs/lib/utils/path');

import Rendition from './Rendition';
import Streamer from './Streamer';

export const bookOptionsExtras = {
  manager: 'continuous',
};

class Epub extends Component {
  constructor(props) {
    super(props);

    var bounds = Dimensions.get('window');

    this.state = {
      toc: [],
      show: false,
      width: bounds.width,
      height: bounds.height,
      orientation: 'PORTRAIT',
    };

    this.streamer = new Streamer();
  }

  componentDidMount() {
    this.active = true;
    this._isMounted = true;
    this.changeListener =  AppState.addEventListener('change', this._handleAppStateChange.bind(this));

    if (this.props.src) {
      this._loadBook(this.props.src);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;

    this.changeListener.remove();

    this.streamer.kill();

    this.destroy();
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextState.show !== this.state.show) {
      return true;
    }

    if (nextProps.width !== this.props.width || nextProps.height !== this.props.height) {
      return true;
    }

    if (nextState.width !== this.state.width || nextState.height !== this.state.height) {
      return true;
    }

    if (nextProps.scrollEnabled !== this.props.scrollEnabled) {
      return true;
    }

    if (nextProps.pagingEnabled !== this.props.pagingEnabled) {
      return true;
    }

    if (nextProps.color != this.props.color) {
      return true;
    }

    if (nextProps.backgroundColor != this.props.backgroundColor) {
      return true;
    }

    if (nextProps.size != this.props.size) {
      return true;
    }

    if (nextProps.flow != this.props.flow) {
      return true;
    }

    if (nextProps.origin != this.props.origin) {
      return true;
    }

    if (nextProps.src != this.props.src) {
      return true;
    }

    if (nextProps.onPress != this.props.onPress) {
      return true;
    }

    if (nextProps.onLongPress != this.props.onLongPress) {
      return true;
    }

    if (nextProps.onDblPress != this.props.onDblPress) {
      return true;
    }

    if (nextProps.stylesheet != this.props.stylesheet) {
      return true;
    }

    if (nextProps.javascript != this.props.javascript) {
      return true;
    }

    return false;
  }

  componentDidUpdate(prevProps) {
    if (prevProps.src !== this.props.src) {
      this.destroy();
      this._loadBook(this.props.src);
    } else if (prevProps.orientation !== this.props.orientation) {
      _orientationDidChange(this.props.orientation);
    }
  }

  _loadBook(bookUrl) {
    // console.log("loading book: ", bookUrl);
    const options = this.props.options || {};

    this.book = ePub({
      replacements: this.props.base64 || 'none',
      ...options,
      ...bookOptionsExtras,
    });

    return this._openBook(bookUrl);

    // const type = this.book.determineType(bookUrl);
    // const uri = new Uri(bookUrl);
    // if ((type === "directory") || (type === "opf")) {
    //   return this._openBook(bookUrl);
    // } else {
    //   return this.streamer.start()
    //   .then((localOrigin) => {
    //     this.setState({localOrigin})
    //     return this.streamer.get(bookUrl);
    //   })
    //   .then((localUrl) => {
    //     this.setState({localUrl})
    //     return this._openBook(localUrl);
    //   });
    // }
  }

  _openBook(bookUrl, useBase64) {
    // console.log("open book: ", bookUrl);

    var type = useBase64 ? 'base64' : null;

    if (!this.rendition) {
      this.needsOpen = [bookUrl, useBase64];
      return;
    }

    this.book.open(bookUrl).catch((err) => {
      console.error(err);
    });

    this.book.ready.then(() => {
      this.isReady = true;
      this.props.onReady && this.props.onReady(this.book);
    });

    this.book.loaded.navigation.then((nav) => {
      if (!this.active || !this._isMounted) {
        return;
      }
      this.setState({ toc: nav.toc });
      this.props.onNavigationReady && this.props.onNavigationReady(nav.toc);
    });

    if (this.props.generateLocations != false) {
      this.loadLocations().then((locations) => {
        this.rendition.setLocations(locations);
        // this.rendition.reportLocation();
        this.props.onLocationsReady && this.props.onLocationsReady(this.book.locations);
      });
    }
  }

  loadLocations() {
    return this.book.ready.then(() => {
      // Load in stored locations from json or local storage
      var key = this.book.key() + '-locations';

      return AsyncStorage.getItem(key).then((stored) => {
        if (this.props.regenerateLocations != true && stored !== null) {
          return this.book.locations.load(stored);
        }
        return this.book.locations.generate(this.props.locationsCharBreak || 600).then((locations) => {
          // Save out the generated locations to JSON
          AsyncStorage.setItem(key, this.book.locations.save());
          return locations;
        });
      });
    });
  }

  onRelocated(visibleLocation) {
    this._visibleLocation = visibleLocation;

    if (this.props.onLocationChange) {
      this.props.onLocationChange(visibleLocation);
    }
  }

  visibleLocation() {
    return this._visibleLocation;
  }

  getRange(cfi) {
    return this.book.getRange(cfi);
  }

  _handleAppStateChange(appState) {
    if (appState === 'active') {
      this.active = true;
    }

    if (appState === 'background') {
      this.active = false;
    }

    if (appState === 'inactive') {
      this.active = false;
    }
  }

  destroy() {
    if (this.book) {
      this.book.destroy();
    }
  }

  render() {
    return (
      <Rendition
        ref={(r) => {
          this.rendition = r;
          this.props?.setRenditionRef && this.props?.setRenditionRef(r);

          if (this.needsOpen) {
            this._openBook.apply(this, this.needsOpen);
            this.needsOpen = undefined;
          }
        }}
        url={this.props.src}
        flow={this.props.flow}
        minSpreadWidth={this.props.minSpreadWidth}
        stylesheet={this.props.stylesheet}
        webviewStylesheet={this.props.webviewStylesheet}
        script={this.props.script}
        onSelected={this.props.onSelected}
        onMarkClicked={this.props.onMarkClicked}
        onPress={this.props.onPress}
        onLongPress={this.props.onLongPress}
        onDblPress={this.props.onDblPress}
        onViewAdded={this.props.onViewAdded}
        beforeViewRemoved={this.props.beforeViewRemoved}
        themes={this.props.themes}
        theme={this.props.theme}
        fontSize={this.props.fontSize}
        font={this.props.font}
        display={this.props.location}
        onRelocated={this.onRelocated.bind(this)}
        orientation={this.state.orientation}
        backgroundColor={this.props.backgroundColor}
        onError={this.props.onError}
        contentInset={this.props.contentInset || defaultContentInset}
        onDisplayed={this.props.onDisplayed}
        width={this.props.width}
        height={this.props.height}
        scalesPageToFit={this.props.scalesPageToFit}
        showsHorizontalScrollIndicator={this.props.showsHorizontalScrollIndicator}
        showsVerticalScrollIndicator={this.props.showsVerticalScrollIndicator}
        scrollEnabled={this.props.scrollEnabled}
        pagingEnabled={this.props.pagingEnabled}
        onNavigationStateChange={this.props.onNavigationStateChange}
        onShouldStartLoadWithRequest={this.props.onShouldStartLoadWithRequest}
        isContentReady={this.props.isContentReady}
        options={this.props.options}
        {...(this.props.webviewProps || {})}
      />
    );
  }
}

export default Epub;
