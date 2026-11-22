import AppKit
import WebKit
import UniformTypeIdentifiers

private final class WalkPresentationWindow: NSWindow {
    override var canBecomeKey: Bool { true }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    private var walkWindow: WalkPresentationWindow?
    private var previousPresentationOptions: NSApplication.PresentationOptions = []
    var walkMouseMonitor: Any?
    var walkMouseTimer: Timer?
    var walkCaptured = false
    var pendingMouseX = 0.0
    var pendingMouseY = 0.0
    var smokeHadMouseCapture = false
    var landscapeSmokePhase = false
    let smoke = CommandLine.arguments.contains("--smoke-test")
    var storeURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("DomPlan", isDirectory: true).appendingPathComponent("project.json")
    }
    func literal(_ string: String) -> String {
        String(data: try! JSONEncoder().encode(string), encoding: .utf8)!
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "domplan")
        if smoke { configuration.userContentController.addUserScript(WKUserScript(source: "window.smokeErrors=[];window.addEventListener('error',e=>window.smokeErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.smokeErrors.push(String(e.reason)));", injectionTime: .atDocumentStart, forMainFrameOnly: true)) }
        if smoke { configuration.websiteDataStore = .nonPersistent() }
        if !smoke, let text = try? String(contentsOf: storeURL, encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(source: "window.domplanNativeProject = \(literal(text));", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1380, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "ДомПлан"
        window.minSize = NSSize(width: 920, height: 640)
        window.contentView = webView
        window.backgroundColor = NSColor(calibratedRed: 0.96, green: 0.97, blue: 0.99, alpha: 1)
        window.delegate = self
        window.acceptsMouseMovedEvents = true
        if !smoke { window.setFrameAutosaveName("DomPlanMainWindow") }
        window.center()
        makeMenu()
        let index = Bundle.main.resourceURL!.appendingPathComponent("Web/index.html")
        webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if smoke {
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
                guard let self else { return }
                self.finishSmoke(["ok": false, "error": "Native WebKit smoke test timed out"])
            }
        }
    }
    func makeMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "О программе ДомПлан", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Скрыть ДомПлан", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Завершить ДомПлан", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let fileItem = NSMenuItem(title: "Файл", action: nil, keyEquivalent: ""); menu.addItem(fileItem)
        let fileMenu = NSMenu(title: "Файл"); fileItem.submenu = fileMenu
        for (title, action, key) in [("Новый проект", "new", "n"), ("Открыть…", "open", "o"), ("Сохранить в файл…", "save", "s")] {
            let item = NSMenuItem(title: title, action: #selector(fileAction(_:)), keyEquivalent: key)
            item.representedObject = action; item.target = self; fileMenu.addItem(item)
        }
        let editItem = NSMenuItem(title: "Правка", action: nil, keyEquivalent: ""); menu.addItem(editItem)
        let edit = NSMenu(title: "Правка"); editItem.submenu = edit
        for (title, action, shift) in [("Отменить", "undo", false), ("Повторить", "redo", true)] {
            let item = NSMenuItem(title: title, action: #selector(fileAction(_:)), keyEquivalent: "z")
            item.representedObject = action; item.target = self
            item.keyEquivalentModifierMask = shift ? [.command, .shift] : [.command]; edit.addItem(item)
        }
        edit.addItem(.separator())
        edit.addItem(withTitle: "Вырезать", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Скопировать", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Вставить", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Выбрать всё", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let viewItem = NSMenuItem(title: "Окно", action: nil, keyEquivalent: ""); menu.addItem(viewItem)
        let view = NSMenu(title: "Окно"); viewItem.submenu = view
        view.addItem(withTitle: "Свернуть", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        NSApp.mainMenu = menu
    }
    @objc func about() {
        NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "ДомПлан", .applicationVersion: "0.43", .credits: NSAttributedString(string: "Редактор плана дома, 3D-визуализация, ландшафт и прогулка от первого лица.\nReact · TypeScript · Three.js · Swift / WebKit\nРаботает локально, без интернета.\n3D-деревья: LOLIPOP (sketchfab.com/lolipop_1707), CC BY 4.0.\nГазон: assetfactory (Sketchfab Standard).\nТрава и цветы: Kless и Asia Matusik, CC BY 4.0.\nПолные ссылки и описание адаптации: THIRD-PARTY-NOTICES.txt в ресурсах приложения.")])
    }
    @objc func fileAction(_ sender: NSMenuItem) {
        let action = sender.representedObject as? String ?? ""
        webView.evaluateJavaScript("window.domplanNativeAction?.(\(literal(action)))")
    }
    func notice(_ message: String) { webView.evaluateJavaScript("window.domplanNotice?.(\(literal(message)))") }
    func setWalkFullscreen(_ enabled: Bool) {
        if enabled, walkWindow == nil, let screen = window.screen ?? NSScreen.main {
            setWalkCapture(false)
            let presentation = WalkPresentationWindow(contentRect: screen.frame, styleMask: .borderless,
                backing: .buffered, defer: false, screen: screen)
            presentation.backgroundColor = .black
            presentation.acceptsMouseMovedEvents = true
            presentation.delegate = self
            previousPresentationOptions = NSApp.presentationOptions
            NSApp.presentationOptions = [.hideMenuBar, .hideDock]
            walkWindow = presentation
            window.contentView = nil
            presentation.contentView = webView
            presentation.setFrame(screen.frame, display: true)
            presentation.makeKeyAndOrderFront(nil)
            window.orderOut(nil)
        } else if !enabled, let presentation = walkWindow {
            setWalkCapture(false)
            presentation.contentView = nil
            window.contentView = webView
            NSApp.presentationOptions = previousPresentationOptions
            window.makeKeyAndOrderFront(nil)
            presentation.orderOut(nil)
            walkWindow = nil
        }
        webView.evaluateJavaScript("window.domplanWalkFullscreen?.(\(walkWindow != nil))")
    }
    func setWalkCapture(_ enabled: Bool) {
        if enabled {
            guard !walkCaptured else { return }
            guard (!smoke || (CommandLine.arguments.contains("--smoke-input") && !landscapeSmokePhase)), NSApp.isActive, webView.window?.isKeyWindow == true,
                  CGAssociateMouseAndMouseCursorPosition(0) == .success else {
                webView.evaluateJavaScript("window.domplanPointerCapture?.(false)")
                return
            }
            walkCaptured = true
            pendingMouseX = 0; pendingMouseY = 0
            NSCursor.hide()
            walkMouseMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged, .keyDown]) { [weak self] event in
                let suppress = MainActor.assumeIsolated { () -> Bool in
                    guard let self, self.walkCaptured else { return false }
                    if event.type == .keyDown {
                        if event.keyCode == 53 { self.setWalkCapture(false); return true }
                        return false
                    }
                    self.pendingMouseX += event.deltaX
                    self.pendingMouseY += event.deltaY
                    return true
                }
                return suppress ? nil : event
            }
            let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self, self.walkCaptured else { return }
                    let x = self.pendingMouseX, y = self.pendingMouseY
                    self.pendingMouseX = 0; self.pendingMouseY = 0
                    if x != 0 || y != 0 { self.webView.evaluateJavaScript("window.domplanMouseDelta?.(\(x),\(y))") }
                }
            }
            walkMouseTimer = timer
            RunLoop.main.add(timer, forMode: .common)
            webView.evaluateJavaScript("window.domplanPointerCapture?.(true)")
        } else if walkCaptured {
            walkCaptured = false
            walkMouseTimer?.invalidate(); walkMouseTimer = nil
            if let monitor = walkMouseMonitor { NSEvent.removeMonitor(monitor) }
            walkMouseMonitor = nil
            CGAssociateMouseAndMouseCursorPosition(1)
            NSCursor.unhide()
            webView.evaluateJavaScript("window.domplanPointerCapture?.(false)")
        }
    }
    func applicationDidResignActive(_ notification: Notification) { setWalkCapture(false) }
    func applicationWillTerminate(_ notification: Notification) {
        setWalkCapture(false)
        if walkWindow != nil { NSApp.presentationOptions = previousPresentationOptions }
    }
    func windowDidResignKey(_ notification: Notification) { setWalkCapture(false) }
    func windowWillClose(_ notification: Notification) { setWalkCapture(false) }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "walkFullscreen":
            setWalkFullscreen(body["enabled"] as? Bool == true)
        case "walkCapture":
            setWalkCapture(body["enabled"] as? Bool == true)
        case "autosave":
            guard !smoke, let text = body["text"] as? String, text.utf8.count <= 5_000_000 else { return }
            do {
                try FileManager.default.createDirectory(at: storeURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                try text.write(to: storeURL, atomically: true, encoding: .utf8)
            } catch { notice("Не удалось сохранить автоматически. Сохраните проект в файл.") }
        case "save":
            guard let text = body["text"] as? String else { return }
            let panel = NSSavePanel(); panel.allowedContentTypes = [.json]; panel.canCreateDirectories = true
            panel.nameFieldStringValue = body["filename"] as? String ?? "Мой дом.domplan.json"
            panel.beginSheetModal(for: webView.window ?? window) { [weak self] response in
                if response == .OK, let url = panel.url {
                    do { try text.write(to: url, atomically: true, encoding: .utf8); self?.notice("Проект сохранён в файл") }
                    catch { self?.notice("Не удалось сохранить файл: \(error.localizedDescription)") }
                }
            }
        case "open":
            let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
            panel.beginSheetModal(for: webView.window ?? window) { [weak self] response in
                guard response == .OK, let url = panel.url, let self else { return }
                do {
                    let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
                    guard (attrs[.size] as? NSNumber)?.intValue ?? 0 <= 5_000_000 else { self.notice("Максимальный размер файла — 5 МБ"); return }
                    let text = try String(contentsOf: url, encoding: .utf8)
                    self.webView.evaluateJavaScript("window.domplanOpen?.(\(self.literal(text)))")
                } catch { self.notice("Не удалось открыть файл: \(error.localizedDescription)") }
            }
        default: break
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // All application resources are bundled. Remote navigation is unnecessary.
        decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard smoke else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.webView.evaluateJavaScript("JSON.stringify({title:document.title,walls:document.querySelector('[data-testid=wall-count]')?.textContent,area:document.querySelector('[data-testid=total-area]')?.textContent,plan:!!document.querySelector('[data-testid=plan-svg]')})") { result, error in
                guard let self else { return }
                guard error == nil, let text = result as? String, let data = text.data(using: .utf8), let plan = try? JSONSerialization.jsonObject(with: data) as? [String: Any], plan["plan"] as? Bool == true else {
                    self.finishSmoke(["ok": false, "error": error?.localizedDescription ?? "2D view missing"]); return
                }
                self.webView.evaluateJavaScript("document.querySelector('[data-testid=mode-3d]').click()")
                DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                    self.webView.evaluateJavaScript("JSON.stringify({mode:document.querySelector('.app')?.dataset.mode,errors:window.smokeErrors,body:document.body.innerText.slice(0,1500),canvas:!!document.querySelector('canvas'),frames:Number(document.querySelector('canvas')?.dataset.frames||0),walls:document.querySelector('canvas')?.dataset.walls,error:document.querySelector('.render-error')?.textContent||null})") { result, error in
                        let text = result as? String ?? "{}", data = text.data(using: .utf8)!
                        let model = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
                        let ok = (model["frames"] as? Int ?? 0) > 0 && model["walls"] as? String == "7" && error == nil
                        if ok { self.checkWalk(plan: plan, model: model) }
                        else { self.finishSmoke(["ok": false, "plan": plan, "model": model]) }
                    }
                }
            }
        }
    }
    func checkWalk(plan: [String: Any], model: [String: Any]) {
        webView.evaluateJavaScript("document.querySelector('[data-testid=mode-walk]').click()")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self else { return }
            self.webView.evaluateJavaScript("window.walkSmokeStart={x:Number(document.querySelector('canvas')?.dataset.x),z:Number(document.querySelector('canvas')?.dataset.z),yaw:Number(document.querySelector('canvas')?.dataset.yaw)};document.querySelector('[data-testid=walk-start]').click();document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true}))")
            if CommandLine.arguments.contains("--smoke-input") {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    self.smokeHadMouseCapture = self.walkCaptured
                    if let event = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: .zero, mouseButton: .left) {
                        event.setIntegerValueField(.mouseEventDeltaX, value: 50)
                        if let local = NSEvent(cgEvent: event) { NSApp.postEvent(local, atStart: false) }
                    }
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
                self.webView.evaluateJavaScript("document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));JSON.stringify({mode:document.querySelector('.app')?.dataset.mode,frames:Number(document.querySelector('canvas')?.dataset.frames||0),eyeHeight:Number(document.querySelector('canvas')?.dataset.eyeHeight),personHeight:Number(document.querySelector('canvas')?.dataset.personHeight),distance:Math.hypot(Number(document.querySelector('canvas')?.dataset.x)-window.walkSmokeStart.x,Number(document.querySelector('canvas')?.dataset.z)-window.walkSmokeStart.z),yawChange:Number(document.querySelector('canvas')?.dataset.yaw)-window.walkSmokeStart.yaw,input:document.querySelector('canvas')?.dataset.input,errors:window.smokeErrors})") { result, error in
                    let data = (result as? String ?? "{}").data(using: .utf8)!
                    var walk = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
                    walk["nativeMouseCaptured"] = self.smokeHadMouseCapture
                    let mouseOK = !CommandLine.arguments.contains("--smoke-input") || (self.smokeHadMouseCapture && abs(walk["yawChange"] as? Double ?? 0) > 0.05)
                    let ok = mouseOK && error == nil && walk["mode"] as? String == "walk" && abs((walk["eyeHeight"] as? Double ?? 0) - 1.65) < 0.00001 && walk["personHeight"] as? Double == 1.75 && (walk["distance"] as? Double ?? 0) > 0.1 && (walk["errors"] as? [String] ?? ["Missing error diagnostics"]).isEmpty
                    if ok { self.checkLandscape(plan: plan, model: model, walk: walk) }
                    else { self.finishSmoke(["ok": false, "plan": plan, "model": model, "walk": walk]) }
                }
            }
        }
    }
    func checkLandscape(plan: [String: Any], model: [String: Any], walk: [String: Any]) {
        landscapeSmokePhase = true
        let fixture = #"{"version":1,"name":"Проверка ландшафта","walls":[],"openings":[],"plants":[{"id":"birch","kind":"birch","variant":"birch-2","position":{"x":5,"y":2.5},"height":5.5,"rotation":0,"seed":47},{"id":"pine","kind":"pine","position":{"x":12,"y":0},"height":8,"rotation":90,"seed":48},{"id":"fir","kind":"fir","variant":"fir-4","position":{"x":-3,"y":0},"height":5,"rotation":10,"seed":49},{"id":"maple","kind":"maple","variant":"maple-medium-2","position":{"x":17,"y":-4},"height":6,"rotation":0,"seed":50}],"lawn":[{"id":"grass1","position":{"x":5,"y":3},"size":2},{"id":"grass2","position":{"x":-4.5,"y":1.5},"size":3}]}"#
        webView.evaluateJavaScript("window.domplanOpen(\(literal(fixture)));document.querySelector('[data-testid=mode-3d]').click()")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self else { return }
            self.webView.evaluateJavaScript("JSON.stringify({lawn:JSON.parse(document.querySelector('canvas')?.dataset.lawn||'[]'),plants:JSON.parse(document.querySelector('canvas')?.dataset.landscape||'[]'),catalogue:document.querySelectorAll('.plant-preview img').length,errors:window.smokeErrors})") { result, error in
                let data = (result as? String ?? "{}").data(using: .utf8)!
                let landscape = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
                let plants = landscape["plants"] as? [[String: Any]] ?? []
                let grass = landscape["lawn"] as? [[String: Any]] ?? []
                let grassOK = grass.count == 2 && grass.allSatisfy { abs(($0["size"] as? Double ?? 0) - ($0["modelWidth"] as? Double ?? -1)) < 0.0001 && abs(($0["grassHeight"] as? Double ?? 0) - 0.12) < 0.0001 }
                let heightsOK = grassOK && plants.count == 4 && plants.allSatisfy { abs(($0["height"] as? Double ?? 0) - ($0["modelHeight"] as? Double ?? -1)) < 0.0001 }
                if error != nil || !heightsOK { self.finishSmoke(["ok": false, "landscape": landscape]); return }
                self.webView.evaluateJavaScript("document.querySelector('[data-testid=mode-walk]').click()")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                    self.webView.evaluateJavaScript("document.querySelector('[data-testid=walk-start]').click();document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true}))")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                        self.webView.evaluateJavaScript("document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));JSON.stringify({lawn:JSON.parse(document.querySelector('canvas')?.dataset.lawn||'[]'),plants:JSON.parse(document.querySelector('canvas')?.dataset.landscape||'[]'),x:Number(document.querySelector('canvas')?.dataset.x),z:Number(document.querySelector('canvas')?.dataset.z),errors:window.smokeErrors})") { result, error in
                            let data = (result as? String ?? "{}").data(using: .utf8)!
                            let plantedWalk = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
                            let z = plantedWalk["z"] as? Double ?? 0, x = plantedWalk["x"] as? Double ?? 0
                            let sameLawn = (landscape["lawn"] as? NSArray)?.isEqual(to: plantedWalk["lawn"] as? [Any] ?? []) == true
                            let ok = sameLawn && error == nil && (plantedWalk["plants"] as? [Any] )?.count == 4 && z > 2.77 && z < 2.85 && abs(x - 5) < 0.01 && (plantedWalk["errors"] as? [String] ?? ["Missing diagnostics"]).isEmpty
                            self.finishSmoke(["ok": ok, "plan": plan, "model": model, "walk": walk, "landscape": landscape, "plantedWalk": plantedWalk])
                        }
                    }
                }
            }
        }
    }
    func finishSmoke(_ result: [String: Any]) {
        let path = CommandLine.arguments.drop(while: { $0 != "--smoke-test" }).dropFirst().first ?? "/tmp/domplan-smoke.json"
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: URL(fileURLWithPath: path)) }
        NSApp.terminate(nil)
    }
}
MainActor.assumeIsolated {
    let application = NSApplication.shared
    let delegate = AppDelegate()
    application.delegate = delegate
    application.run()
}
