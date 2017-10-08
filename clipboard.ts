"use strict";

export class clipboard {
  private static DEBUG: boolean = false;
  private static misingPlainTextWarning = true;

  // TODO: Compile debug logging code out of release builds?
  private static enableDebugLogging() {
    clipboard.DEBUG = true;
  }

  private static suppressMissingPlainTextWarning() {
    this.misingPlainTextWarning = false;
  }

  protected static copyListener(tracker: clipboard.FallbackTracker, data: clipboard.DT, e: ClipboardEvent): void {
    if (clipboard.DEBUG) (console.info || console.log).call(console, "listener called");
    tracker.listenerCalled = true;
    data.forEach((value: string, key: string) => {
      e.clipboardData.setData(key, value);
      if (key === clipboard.DataTypes.TEXT_PLAIN && e.clipboardData.getData(key) != value) {
        if (clipboard.DEBUG) (console.info || console.log).call(console, "Setting text/plain failed.");
        tracker.listenerSetPlainTextFailed = true;
      }
    });
    e.preventDefault();
  }

  protected static execCopy(data: clipboard.DT): clipboard.FallbackTracker {
    var tracker = new clipboard.FallbackTracker();
    var listener = this.copyListener.bind(this, tracker, data);

    document.addEventListener("copy", listener);
    try {
      tracker.execCommandReturnedTrue = document.execCommand("copy");
    } finally {
      document.removeEventListener("copy", listener);
    }
    return tracker;
  }

  // Create a temporary DOM element to select, so that `execCommand()` is not
  // rejected.
  private static copyUsingTempSelection(e: HTMLElement, data: clipboard.DT): clipboard.FallbackTracker {
    clipboard.Selection.select(e);
    var tracker = this.execCopy(data);
    clipboard.Selection.clear();
    return tracker;
  }

  // Create a temporary DOM element to select, so that `execCommand()` is not
  // rejected.
  private static copyUsingTempElem(data: clipboard.DT): clipboard.FallbackTracker {
    var tempElem = document.createElement("div");
    // Place some text in the elem so that Safari has something to select.
    tempElem.textContent = "temporary element";
    document.body.appendChild(tempElem);

    var tracker = this.copyUsingTempSelection(tempElem, data);

    document.body.removeChild(tempElem);
    return tracker;
  }

  // Uses shadow DOM.
  private static copyTextUsingDOM(str: string): boolean {
    if (clipboard.DEBUG) (console.info || console.log).call(console, "attempting to copy text using DOM");

    var tempElem = document.createElement("div");
    var shadowRoot = tempElem.attachShadow({mode: "open"});
    document.body.appendChild(tempElem);

    var span = document.createElement("span");
    span.textContent = str;
    span.style.whiteSpace = "pre-wrap"; // TODO: Use `innerText` above instead?
    shadowRoot.appendChild(span);
    clipboard.Selection.select(span);

    var result = document.execCommand("copy");

    // clipboard.Selection.clear();
    document.body.removeChild(tempElem);

    return result;
  }

  public static write(data: clipboard.DT): Promise<void> {
    if (this.misingPlainTextWarning && !data.getData(clipboard.DataTypes.TEXT_PLAIN)) {
      (console.warn || console.log).call(console,
        "[clipboard.js] clipboard.write() was called without a "+
        "`text/plain` data type. On some platforms, this may result in an "+
        "empty clipboard. Call clipboard.suppressMissingPlainTextWarning() "+
        "to suppress this warning.");
    }

    // TODO: Allow fallback graph other than a single line.

    return new Promise<void>((resolve, reject) => {
      var tracker = this.execCopy(data);
      if (tracker.listenerCalled && !tracker.listenerSetPlainTextFailed) {
        if (clipboard.DEBUG) (console.info || console.log).call(console, "Regular copy command succeeded.");
        resolve();
        return;
      }

      // Success detection on Edge is not possible, due to bugs in all 4
      // detection mechanisms we could try to use. Assume success.
      if (tracker.listenerCalled && navigator.userAgent.indexOf("Edge") > -1) {
        if (clipboard.DEBUG) (console.info || console.log).call(console, "User agent contains \"Edge\". Blindly assuming success.");
        resolve();
        return;
      }

      // Fallback 1 for desktop Safari.
      tracker = this.copyUsingTempSelection(document.body, data);
      if (tracker.listenerCalled && !tracker.listenerSetPlainTextFailed) {
        if (clipboard.DEBUG) (console.info || console.log).call(console, "Copied using temporary document.body selection.");
        resolve();
        return;
      }

      // Fallback 2 for desktop Safari. 
      tracker = this.copyUsingTempElem(data);
      if (tracker.listenerCalled && !tracker.listenerSetPlainTextFailed) {
        if (clipboard.DEBUG) (console.info || console.log).call(console, "Copied using selection of temporary element added to DOM.");
        resolve();
        return;
      }

      // Fallback for iOS Safari.
      // TODO: Double-check to see that this is needed.
      // TODO: Don't cast.
      if (this.copyTextUsingDOM(<string>data.getData(clipboard.DataTypes.TEXT_PLAIN))) {
        if (clipboard.DEBUG) (console.info || console.log).call(console, "Copied text using DOM.");
        resolve();
        return;
      }

      // reject(new Error("Copy command failed."));
    });
  }

  static writeText(s: string): Promise<void> {
    var dt = new clipboard.DT();
    dt.setData(clipboard.DataTypes.TEXT_PLAIN, s);
    return clipboard.write(dt);
  }

  static read(): Promise<clipboard.DT> {
    return new Promise((resolve, reject) => reject("Cannot read in any modern browsers. IE11 pasting is not implemented yet."));
  }

  static readText(): Promise<string> {
    return new Promise((resolve, reject) => reject("Cannot read in any modern browsers. IE11 pasting is not implemented yet."));
  }

  // Legacy v1 API.
  static copy(obj: string|{[key:string]:string}|HTMLElement): Promise<void> {
    (console.warn || console.log).call(console, "[clipboard.js] The clipboard.copy() API is deprecated and may be removed in a future version. Please switch to clipboard.write() or clipboard.writeText().");

    return new Promise((resolve, reject) => {
      var data: clipboard.DT;
      if (typeof obj === "string") {
        data = clipboard.DT.fromText(obj);
      } else if (obj instanceof HTMLElement) {
        data = clipboard.DT.fromElement(obj);
      } else if (obj instanceof Object) {
        data = clipboard.DT.fromObject(obj);
      } else {
        reject("Invalid data type. Must be string, DOM node, or an object mapping MIME types to strings.");
        return;
      }
      this.write(data);
    });
  }

  // Legacy v1 API.
  static paste(): Promise<string> {
    (console.warn || console.log).call(console, "[clipboard.js] The clipboard.paste() API is deprecated and may be removed in a future version. Please switch to clipboard.read() or clipboard.readText().");
    return new Promise((resolve, reject) => reject("Cannot read in any modern browsers. IE11 pasting is not implemented yet."));
  }
}

export namespace clipboard {
  export const DataTypes: {[key:string]:string} = {
    TEXT_PLAIN: "text/plain",
    TEXT_HTML: "text/html"
  }

  export const DataTypeLookup: {[key:string]:boolean} = {
    "text/plain": true,
    "text/html": true
  }

  export class DT {
    private m: Map<string, string> = new Map<string, string>();

    setData(type: string, value: string): void {
      if (!(type in DataTypeLookup)) {
        (console.warn || console.log).call(console, "[clipboard.js] Unknown data type: " + type);
      }

      this.m.set(type, value);
    }

    getData(type: string): string | undefined {
      return this.m.get(type);
    }

    // TODO: Provide an iterator consistent with DataTransfer.
    forEach(f: (value: string, key: string) => void): void {
      return this.m.forEach(f);
    }

    static fromText(s: string): DT {
      var dt = new DT();
      dt.setData(clipboard.DataTypes.TEXT_PLAIN, s);
      return dt;
    }

    static fromObject(obj: {[key:string]:string}): DT {
      var dt = new DT();
      for (var key in obj) {
        dt.setData(key, obj[key]);
      }
      return dt;
    }

    static fromElement(e: HTMLElement): DT {
      var dt = new DT();
      dt.setData(clipboard.DataTypes.TEXT_PLAIN, e.innerText);
      dt.setData(clipboard.DataTypes.TEXT_HTML, new XMLSerializer().serializeToString(e));
      return dt;
    }
  }

  export class Selection {
    static select(elem: Element): void {
      var sel = document.getSelection();
      var range = document.createRange();
      range.selectNodeContents(elem);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    static clear(): void {
      var sel = document.getSelection();
      sel.removeAllRanges();
    }
  }

  export class FallbackTracker {
    public execCommandReturnedTrue: boolean = false;
    public listenerCalled: boolean = false;
    public listenerSetPlainTextFailed: boolean = false;
  }
}
