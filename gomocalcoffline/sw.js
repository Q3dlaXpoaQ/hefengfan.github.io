    const DEBUG_SERVER_WORKER = true;
    const scriptVersion = "v0.26.002";
    const home = new Request("./").url;
    const VERSION_JSON = new Request("./Version/SOURCE_FILES.json").url;
    const currentCacheKey = "currentCache" + "gomocalc" + scriptVersion; 
    const updataCacheKey = "updataCache" + "gomocalc" + scriptVersion; 
    const refreshVersionInterval = 3600 * 1000;
    const firstUpdateCacheDelay = 3 * 3600 * 1000;
    const CacheStatus = {
    	UPDATE: 1,
    	UPDATING: 2,
    	UPDATED: 3,
    	STOPING: 4,
    };
    Object.freeze(CacheStatus);
    let updateStatus = CacheStatus.UPDATE;
    let newVersionInfo = null;
    let updateVersionInfo = null;
    let currentVersionInfo = null;
    let lastRefreshTime = new Date().getTime();
    let createTime;
    let currentClient;
    
	self.clients.matchAll().then(clients => currentClient = clients.filter(c=>c))
    
    //------------------------------- Response --------------------------------
    
    const requestInit = {
    	cache: "no-store", //不使用缓存
    	mode: 'cors' //支持跨域访问
    };
    
    const headers_html = { "Content-Type": 'text/html; charset=utf-8' };
    const response_200_init_html = {
    	status: 200,
    	statusText: "OK",
    	headers: headers_html
    };
    const response_404_init_data = {
    	status: 404
    };
    
	const response_err_html = `<!DOCTYPE html><html lang="en"><head><meta http-equiv="refresh"content="0;url=/gomocalcoffline/index.html"></head><body>Redirecting to Gomoku Calcuator...</body></html>`;
	const response_err_data = "Error 404, file not found.";
    const response_err_cache = "Error 404, file not found in cache";
    const request_reject = "Failed to fetch. request rejected";
    
    //---------------------------------- loading -----------------------------------
    
    const load = (() => {
    	let countRequests = 0;
    	return {
    		loading: (url, client) => {
    			countRequests++;
    			countRequests == 1 && syncMsg(`loading......`, client);
    		},
    		finish: (url, client) => {
				!url && (countRequests=0);
    			countRequests && countRequests--;
    			countRequests == 0 && syncMsg(`load finish`, client);
    		}
    	};
    })();
    
    //-------------------------- caches -----------------------------------
    
    Cache.prototype.putJSON = async function (key, value) {
		return this.put(new Request(key), new Response(JSON.stringify(value)))
			.catch(e => postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js putJSON: Unknown error") }))
    }
    
    Cache.prototype.getJSON = async function(key) {
    	return this.match(new Request(key)).then(response => response && response.text()).then(text => text && JSON.parse(text))
			.catch(e => postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js getJSON: Unknown error") }))
    }
    
    self.localCache = function() {
    	return {
    		setItem: async function(key, value) {
    			return new Promise(resolve => {
    				try {
    					key = key.toString();
    					value = value.toString();
    					caches.open("localCache").then(cache => cache.put(new Request(key), new Response(value))).then(() => resolve(value)).catch(() => resolve());
    				} catch (e) { resolve() }
    			});
    		},
    		getItem: async function(key) {
    			return new Promise(resolve => {
    				try {
    					key = key.toString();
    					caches.open("localCache").then(cache => cache.match(new Request(key))).then(response => response.text()).then(value => resolve(value)).catch(() => resolve());
    				} catch (e) { resolve() }
    			});
    		},
    		removeItem: async function(key) {
    			return new Promise(resolve => {
    				try {
    					key = key.toString();
    					caches.open("localCache").then(cache => cache.delete(new Request(key))).then(() => resolve(true)).catch(() => resolve(false));
    				} catch (e) { resolve(false) }
    			});
    		}
    	}
    }()
    
    async function deleteCache(cacheKey) {
    	return caches.open(cacheKey)
    		.then(cache => cache.keys().then(requests => {
    			const ps = [];
    			requests.map(request => ps.push(cache.delete(request)));
    			return Promise.all(ps);
    		}))
    		.then(() => caches.delete(cacheKey))
    }
    
    //----------------------------------------------------------------------------------------------
   
    function absoluteURL(url) {
    	return new Request(url).url;
    }
    
    function getUrlVersion(version) {
    	return "?v=" + version;
    }

    function formatURL(url) {
    	url = url.split("?")[0].split("#")[0];
    	const indexHtml = url.split("/").pop().indexOf(".") == -1 ? (url.slice(-1) == "/" ? "" : "/") + "index.html" : "";
    	url = url + indexHtml;
    	return url;
    }
    
    //-------------------------- update Cache -----------------------------------
    
    /**
     * 按 paramQueue 参数队列顺序执行 fun 函数
     */
    async function queue(fun, paramQueue = []) {
    	return new Promise((resolve, reject) => {
    		function next() {
    			const args = Array.isArray(paramQueue[index]) ? paramQueue[index] : [paramQueue[index]];
    			if (index++ < paramQueue.length) {
    				Promise.resolve().then(() => fun(...args)).then(next).catch(e=>reject(e && e.stack || e && e.message || JSON.stringify(e || "sw.js queue: Unknown error")))
    			}
    			else resolve()
    		}
    		let index = 0;
    		next()
    	})
    }
     
     /**
     * 从 currentCache 读取版本信息，如果没有就尝试联网更新，更新成功就初始化 currentCache
     */
	var waitingCacheReady;
	async function waitCacheReady(client) {
		const url = formatURL(VERSION_JSON);
		waitingCacheReady = waitingCacheReady || Promise.resolve()
			.then(()=>postMsg({cmd: "log", msg: "waitingCacheReady......"}, client))
    		.then(() => !currentVersionInfo && loadCache(url, currentCacheKey, client))
			.then(response => (response && response.ok) && response.json())
			.then(json => json && (currentVersionInfo = json))
			.then(json => json && (json["status"] = json["status"] || CacheStatus.UPDATE, json["createTime"] = json["createTime"] || new Date().getTime()))
			.then(() => !currentVersionInfo && onlyNet(url, currentCacheKey, client))
			.then(response => (response && response.ok) && response.json())
			.then(json => json && (currentVersionInfo = json))
			.then(json => json && (json["status"] = json["status"] || CacheStatus.UPDATE, json["createTime"] = json["createTime"] || new Date().getTime(), true))
			.then(reset => reset && resetCache(currentCacheKey, currentVersionInfo).then(info => currentVersionInfo = info))
		return waitingCacheReady
	}
	
	/**
	 * 从 updataCache 读取版本信息，如果失败就删除 updataCache
 	*/
 	var watingLoadUpdateVersionInfo;
 	async function loadUpdateVersionInfo(client) {
 		const url = formatURL(VERSION_JSON);
		watingLoadUpdateVersionInfo = watingLoadUpdateVersionInfo || Promise.resolve()
 			.then(()=>postMsg({cmd: "log", msg: "watingLoadUpdateVersionInfo......"}, client))
    		.then(() => !updateVersionInfo && loadCache(url, updataCacheKey, client))
			.then(response => (response && response.ok) && response.json())
			.then(json => json && (updateVersionInfo = json))
			.then(json => json && (json["status"] = json["status"] || CacheStatus.UPDATE, json["createTime"] = json["createTime"] || new Date().getTime()))
		return watingLoadUpdateVersionInfo;
 	}
	
	/**
	 * 刷新版本信息
 	*/
	var waitingRefreshVersionInfos;
	async function refreshVersionInfos(client) {
		const url = formatURL(VERSION_JSON);
		waitingRefreshVersionInfos = waitingRefreshVersionInfos || Promise.resolve()
			.then(() => postMsg({cmd: "log", msg: "refreshVersionInfos......"}, client))
    		.then(() => currentVersionInfo = updateVersionInfo = null)
    		.then(() => !currentVersionInfo && loadCache(url, currentCacheKey, client))
			.then(response => (response && response.ok) && response.json())
			.then(json => json && (currentVersionInfo = json))
			.then(json => json && (json["status"] = json["status"] || CacheStatus.UPDATE, json["createTime"] = json["createTime"] || new Date().getTime()))
			.then(() => !updateVersionInfo && loadCache(url, updataCacheKey, client))
    		.then(response => (response && response.ok) && response.json())
    		.then(json => json && (updateVersionInfo = json))
    		.then(json => json && (json["status"] = json["status"] || CacheStatus.UPDATE, json["createTime"] = json["createTime"] || new Date().getTime()))
    		.then(() => waitingRefreshVersionInfos = undefined)
		return waitingRefreshVersionInfos;
	}
	
	/**
	 * 初始化缓存
 	*/
    async function resetCache(cacheKey, cacheInfo) {
    	const url = formatURL(VERSION_JSON);
    	postMsg({cmd:"log", msg: `reset ${cacheKey} version: ${cacheInfo && cacheInfo.version}`})
    	return deleteCache(cacheKey)
    		.then(() => caches.open(cacheKey))
    		.then(cache => {
    			cacheInfo["status"] = undefined;
				cacheInfo["createTime"] = undefined;
				const newInfo = JSON.parse(JSON.stringify(cacheInfo, null, 2));
    			return cache.putJSON(new Request(url, requestInit), newInfo)
					.then(() => newInfo)
    		})
    }
    
    /**
     * 测试缓存是否完整
     */
    async function checkCache(client, cacheKey) {
    	let count = 0;
    	const info = cacheKey.indexOf("currentCache")===0 ? currentVersionInfo : updateVersionInfo;
    	const urls = Object.keys(info.files).map(key => info.files[key]).map(url => formatURL(url)) || [];
    	cacheKey = cacheKey.indexOf("currentCache")===0 ? currentCacheKey : updataCacheKey;
    	const paramQueue = urls.map(url => [url, cacheKey, client]) || [];
    	return queue((url, cacheKey, client) => loadCache(url, cacheKey, client).then(response => response.ok && count++), paramQueue)
    		.then(() => count == urls.length)
    		.catch(e => (postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js checkCache: Unknown error")}, client), false))
    }
    
    /**
     * 复制 cache，成功返回 true，失败返回 false
     */
    var waitingCopyCache;
    async function copyCache(targetCacheKey, sourceCacheKey) {
    	waitingCopyCache = waitingCopyCache || Promise.all([caches.open(targetCacheKey), caches.open(sourceCacheKey)])
    		.then(([targetCache, sourceCache]) => {
    			return sourceCache.keys().then(requests => queue(request => {
    				postMsg(`copyCache ${sourceCacheKey} to ${targetCacheKey} url: ${decodeURIComponent(request && request.url)}`);
    				return sourceCache.match(request).then(response => targetCache.put(request, response))
    			}, requests))
    		})
    		.then(() => true)
    		.catch(e => (postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js copyCache: Unknown error")}), false))
    		.then(done => (waitingCopyCache = undefined,done))
    	return waitingCopyCache;
    }
    
    /**
     * 复制 cache，成功返回 true，失败返回 false
     */
    var waitingMoveCache;
    async function moveCache(targetCacheKey, sourceCacheKey) {
    	waitingMoveCache = waitingMoveCache || Promise.all([caches.open(targetCacheKey), caches.open(sourceCacheKey)])
    		.then(([targetCache, sourceCache]) => {
    			return sourceCache.keys()
    				.then(requests => queue(request => {
						return targetCache.match(request).then(response => response && targetCache.delete(request))
    				}, requests).then(()=>requests))
    				.then(requests => queue(request => {
    					postMsg(`moveCache ${sourceCacheKey} to ${targetCacheKey} url: ${decodeURIComponent(request && request.url)}`);
    					return sourceCache.match(request).then(response => targetCache.put(request, response)).then(() => sourceCache.delete(request))
    				}, requests))
    		})
    		.then(() => true)
    		.catch(e => (postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js moveCache: Unknown error")}), false))
    		.then(done => (waitingMoveCache = undefined,done))
    	return waitingMoveCache;
    }
    
    /**
     * 把已经缓存的新版本复制到当前版本缓存中
     */
    var waitingCopyToCurrentCache;
    async function copyToCurrentCache(client) {
    	waitingCopyToCurrentCache = waitingCopyToCurrentCache || Promise.resolve()
    		.then(() => postMsg({ cmd: "log", msg: "copyToCurrentCache start" }, client))
    		.then(() => currentVersionInfo.version != updateVersionInfo.version && resetCache(currentCacheKey, updateVersionInfo).then(info => currentVersionInfo = info))
    		.then(() => copyCache(currentCacheKey, updataCacheKey))
    		.then(done => done && checkCache(client, currentCacheKey))
    		.then(done => {
    			done && deleteCache(updataCacheKey);
    			postMsg({ cmd: "log", msg: `copyToCurrentCache ${done?"done":"error"}` }, client);
    			return done;
    		})
    		.catch(e => (postMsg({ cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js copyToCurrentCache: Unknown error") }), false))
    		.then(done => {
    			waitingCopyToCurrentCache = undefined;
    			return done;
    		})
    	return waitingCopyToCurrentCache;
    }
    
    /**
     * 把已经缓存的新版本移动到当前版本缓存中
     */
    var waitingMoveToCurrentCache;
    async function moveToCurrentCache(client) {
    	waitingMoveToCurrentCache = waitingMoveToCurrentCache || Promise.resolve()
    		.then(() => postMsg({cmd: "log", msg: "moveToCurrentCache start"}, client))
    		.then(() => moveCache(currentCacheKey, updataCacheKey))
    		.then(done => done && (waitingCacheReady = currentVersionInfo = undefined, waitCacheReady(client).then(()=>done)))
    		.then(done => done && checkCache(client, currentCacheKey))
    		.then(done => {
    			done && deleteCache(updataCacheKey);
    			postMsg({cmd: "log", msg: `moveToCurrentCache ${done?"done":"error"}`}, client);
    			return done;
    		})
    		.catch(e => (postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js moveToCurrentCache: Unknown error")}), false))
    		.then(done => {
    			waitingMoveToCurrentCache = undefined;
    			return done;
    		})
    	return waitingMoveToCurrentCache;
    }
    
    /**
     * 下载所有离线文件保存到缓存中
     */
    var waitingUpdateFiles;
    var updateFilesProgress;
    async function updateFiles(cacheKey, versionInfo, client, progress) {
    	updateFilesProgress = updateFilesProgress || progress;
    	waitingUpdateFiles = waitingUpdateFiles || Promise.resolve()
    	.then(() => {
    		const files = Object.keys(versionInfo["files"]).map(key=>({key: key, url: versionInfo["files"][key]}));
    		const numAllFiles = files.length;
    		let countCacheFiles = 0;
    		versionInfo["status"] = CacheStatus.UPDATING;
    		postMsg({cmd: "log", msg: `updating ${cacheKey}: ${versionInfo.version} ${Object.keys(versionInfo["files"]).length} files......`}, client);
    		return queue(item => {
    			if (versionInfo["status"] == CacheStatus.UPDATING) {
    				const key = item.key;
    				const url = formatURL(new Request(item.url).url);
    				return loadCache(url, cacheKey)/* 不要client参数，onlyNet不开加载动画*/
    					.then(response => {
    						const tempCacheKey =  cacheKey == updataCacheKey ? currentCacheKey : updataCacheKey;
    						const tempVersionInfo = cacheKey == updataCacheKey ? currentVersionInfo : updateVersionInfo;
    						if (!response.ok && tempVersionInfo && tempVersionInfo["files"] && tempVersionInfo["md5"] && absoluteURL(versionInfo["files"][key]) == absoluteURL(tempVersionInfo["files"][key]) && versionInfo["md5"][key] == tempVersionInfo["md5"][key]) {
    							return loadCache(url, tempCacheKey)
    								.then(response => {
    									if (response.ok) {
    										postMsg(`updateFiles copy ${tempCacheKey} to ${cacheKey} ${decodeURIComponent(url)}`, client)
    										return putCache(cacheKey, new Request(url, requestInit), response)
    									}
    									postMsg(`updateFiles fetch ${decodeURIComponent(url)}`, client)
    									return response;
    								})
    						}
    						else {
    							response.ok && postMsg(`updateFiles load ${cacheKey} ${decodeURIComponent(url)}`, client)
    							!response.ok && postMsg(`updateFiles fetch ${decodeURIComponent(url)}`, client)
    							return response;
    						}
    					})
    					.then(response => !response.ok ? fetchAndPutCache(url, cacheKey) : response)
    					.then(response => {
    						response.ok && countCacheFiles++;
    						typeof updateFilesProgress === "function" && updateFilesProgress(countCacheFiles/numAllFiles)
    					})
    			}
    		}, files).then(() => countCacheFiles == numAllFiles)
    	})
    	.then(updated => updated && checkCache(client, cacheKey))
    	.catch(e => (postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js updateFiles: Unknown error")}), false))
    	.then(updated => {
    		versionInfo["status"] = (updated ? CacheStatus.UPDATED : CacheStatus.UPDATE);
    		postMsg({cmd: "log", msg: `files ${updated ? "updated" : "fout"}`}, client);
    		updated && cacheKey == updataCacheKey && !updateFilesProgress && postMsg({cmd: "moveToCurrentCache"}, client);
    		waitingUpdateFiles = undefined;
    		updateFilesProgress = undefined;
    		return updated;
    	})
    	return waitingUpdateFiles;
    }
    
    /**
     * 计算是否要缓存文件
     */
    var waitingTryUpdate;
    function tryUpdate(client) {
    	waitingTryUpdate = waitingTryUpdate || Promise.resolve()
    		.then(() => {
    			postMsg({cmd: "log", msg: `tryUpdate ${createTime} && ${firstUpdateCacheDelay < new Date().getTime() - createTime} && ${new Date().getTime() - lastRefreshTime > refreshVersionInterval}`}, client)
    			if (createTime &&
    				(firstUpdateCacheDelay < new Date().getTime() - createTime) &&
    				(new Date().getTime() - lastRefreshTime > refreshVersionInterval)
    			) {
    				updateCache(client)
    			}
    		})
    		.catch(e => postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js tryUpdate: Unknown error")}))
    		.then(() => setTimeout(() => { waitingTryUpdate = undefined }, Math.min(180 * 1000, refreshVersionInterval, firstUpdateCacheDelay)))
    	return waitingTryUpdate;
    }
    
    /**
     * 联网刷新版本信息，成功后缓存离线资源，新版本缓存完成后通知用户
     */
    var waitingUpdateCache;
    async function updateCache(client, progress) {
    	const url = formatURL(VERSION_JSON);
    	updateFilesProgress = updateFilesProgress || progress;
    	waitingUpdateCache = waitingUpdateCache || Promise.resolve()
    		.then(() => (postMsg({cmd: "log", msg: "updating......"}, client), updateStatus = CacheStatus.UPDATING))
    		.then(() => onlyNet(url, undefined, client))
    		.then(response => (response && response.ok) ? response.json() : Promise.reject("updateCache: 联网刷新版本信息失败，跳过后续更新"))
    		.then(versionInfo => versionInfo["version"] == currentVersionInfo["version"] ? { cacheKey: currentCacheKey, oldInfo: currentVersionInfo, newInfo: versionInfo } : { cacheKey: updataCacheKey, oldInfo: (updateVersionInfo = updateVersionInfo || JSON.parse(JSON.stringify(currentVersionInfo, null, 2))), newInfo: versionInfo })
    		.then(({cacheKey, oldInfo, newInfo}) => {
    			if (oldInfo["version"] != newInfo["version"]) {
    				return resetCache(cacheKey, newInfo)
    					.then(info => (Object.keys(oldInfo).map(key=>oldInfo[key]=undefined), Object.assign(oldInfo, info)))
    					.then(() => ({versionInfo: oldInfo, cacheKey}))
    			}
    			else {
    				return Promise.resolve()
						.then(() => (oldInfo["files"]={}, Object.assign(oldInfo["files"], newInfo["files"]), oldInfo["md5"]={}, Object.assign(oldInfo["md5"], newInfo["md5"])))
    					.then(() => ({versionInfo: oldInfo, cacheKey}))
    			}
    		})
    		.then(({cacheKey, versionInfo}) => versionInfo["status"] == CacheStatus.UPDATED ? Promise.reject(`${cacheKey} 已经缓存完成，跳过后续更新`) : {cacheKey, versionInfo})
    		.then(({cacheKey, versionInfo}) => (cacheKey == updataCacheKey && currentVersionInfo["md5"] && Object.keys(versionInfo["files"]).map(key => absoluteURL(currentVersionInfo["files"][key])==absoluteURL(versionInfo["files"][key]) && currentVersionInfo["md5"][key]==versionInfo["md5"][key] && (delete versionInfo["files"][key])), {cacheKey, versionInfo}))
    		.then(({cacheKey, versionInfo}) => updateFiles(cacheKey, versionInfo, client, progress))
    		.then(updated => {
    			lastRefreshTime = new Date().getTime() + refreshVersionInterval;
				return localCache.setItem("lastRefreshTime", lastRefreshTime).then(()=>updated)
			})
    		.catch(e => postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js updateCache: Unknown error") }, client))
    		.then(updated => (updateStatus = CacheStatus.UPDATE, waitingUpdateCache = undefined, updated))
    	return waitingUpdateCache;
    }
    
    async function stopUpdating(client) {
    	return new Promise(resolve => {
    		currentVersionInfo["status"] == CacheStatus.UPDATING && (currentVersionInfo["status"] = CacheStatus.STOPING);
    		updateVersionInfo["status"] == CacheStatus.UPDATING && (updateVersionInfo["status"] = CacheStatus.STOPING);
    		let timer = setInterval(() => {
    			if (updateStatus == CacheStatus.UPDATE) {
    				clearInterval(timer);
    				timer = null;
    				resolve()
    			}
    		}, 500)
    	})
    }
    
    //-------------------------- Request Response -----------------------------------
	
    /**
     * 从网络加载 response，如果没有找到，返回标记为404 错误的response
     */
    function onlyNet(url, version, client) {
    	const nRequest = new Request(url.split("?")[0].split("#")[0] + "?v=" + parseInt(new Date().getTime()/1000), requestInit);
    	client && load.loading(url, client);
    	return fetch(nRequest)
    		.then(response => {
    			client && load.finish(url, client);
    			return response;
    		})
    		.catch(err => {
    			client && load.finish(url, client);
    			return new Response(request_reject, response_404_init_data)
    		})
    }
	
	/**
	 * 从缓存读取 response，如果没有找到，返回标记为404 错误的response
 	*/
    function loadCache(url, version, client) {
    	return caches.open(version)
    		.then(cache => {
    			return cache.match(new Request(url, requestInit))
    		})
    		.then(response => {
    			return (response && response.ok) ? response : Promise.reject();
    		})
    		.catch(err => {
    			return new Response(response_err_cache, response_404_init_data)
    		})
    }
    
    /**
     * 把 response 副本保存到缓存，成功后返回 response
     */
    function putCache(version, request, response) {
    	return caches.open(version)
    		.then(cache => cache.put(request, response.clone()))
    		.catch(e => postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || "sw.js putCache: Unknown error") }))
    		.then(()=>response)
    }
    
    /**
     * 返回标记为404 错误的response, HTML 页面做特殊处理
     */
    function fetchError(err, url, version, client) {
    	const type = `${url.split("?")[0].split("#")[0].split(".").pop()}`.toLowerCase();
    	
    	if (["htm", "html"].indexOf(type) + 1) {
    		const request = new Request("./404.html");
    		const _URL = formatURL(request.url);
    		postMsg({cmd: "error", msg: `loadCache response: 404.html`}, client)
    		return loadCache(_URL, version, client)
    			.then(response => {
    				return response.ok ? response : Promise.reject();
    			})
    			.catch(() => {
    				postMsg({cmd: "error", msg: `create response: 404.html`}, client);
    				return new Response(response_err_html, response_200_init_html)
    			})
    	}
    	else {
    		return new Response(response_err_data, response_404_init_data)
    	}
    }
    
    /**
     * 从网络加载 response，如果没有找到，返回标记为404 错误的response
     * response.ok 为 true 时，保存在缓存中
     */
    function fetchAndPutCache(url, version, client) {
    	return onlyNet(url, version, client)
    		.then(response => {
    			if (response.ok && url.indexOf("blob:http") == -1) {
    				return putCache(version, new Request(url, requestInit), response)
    			}
    			return response;
    		})
    }
	
	/**
	 * 从缓存优先获取 response，如果没有找到，返回标记为404 错误的response
	 */
    function cacheFirst(url, version, client) {
    	return loadCache(url, version, client)
    		.then(response => {
    			return response.ok ? response : Promise.reject();
    		})
    		.catch(() => {
    			return fetchAndPutCache(url, version, client);
    		})
    		.then(response => {
    			return response.ok ? response : Promise.reject();
    		})
    		.catch(err => {
    			return fetchError(err, url, version, client)
    		})
    }
	
	/**
	 * 从网络优先获取 response，如果没有找到，返回标记为404 错误的response
	 */
    function netFirst(url, version, client) {
    	return fetchAndPutCache(url, version, client)
    		.then(response => {
    			return response.ok ? response : Promise.reject();
    		})
    		.catch(() => {
    			return loadCache(url, version, client)
    		})
    		.then(response => {
    			return response.ok ? response : Promise.reject();
    		})
    		.catch(err => {
    			return fetchError(err, url, version, client)
    		})
    }
    
    //-------------------- add HTML code -------------------- 

    const tongjihtmlScript = '  <script>\n    var _hmt = _hmt || [];\n    (function(){\n      var hm = document.createElement("script");\n      hm.src = "https://hm.baidu.com/hm.js?bed4a8b88511e0724ea14c479e20c9b5";\n      var s = document.getElementsByTagName("script")[0];\n      s.parentNode.insertBefore(hm,s)\n    })();\n  </script>'
    async function addHTMLCode(response) {
    	if (/^https\:\/\//.test(home) && /\.html$|\.htm$/i.test(response.url.split("?")[0].split("#")[0])) {
    		return response.text()
    			.then(html => {
    				return html.indexOf(tongjihtmlScript) + 1 ? html : html.replace(new RegExp("\<body\>", "i"), `<body>\n` + tongjihtmlScript)
    			})
    			.then(html => new Response(html, response_200_init_html))
    	}
    	else return response;
    }
    
    // -------------------- support SharedArrayBuffer  -------------------- 
    
    async function supportSharedArrayBuffer(response) {
		if (response.status === 0) {
            return response;
        }
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
		newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");

        return new Response(response.body, {
    		status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        })
    }
    
    //-------------------- addEventListener -------------------- 

    self.addEventListener('install', function(event) {
    	self.skipWaiting();
    	/*
    	event.waitUntil()
    	*/
    	//postMsg({ cmd: "alert", msg: `install, ${currentCacheKey}, ${new Date().getTime()}` }, event.clientId);
    });

    self.addEventListener('activate', function(event) {
    	//postMsg({ cmd: "alert", msg: `activate, ${currentCacheKey}, ${new Date().getTime()}` }, event.clientId)
    });
    
    self.addEventListener('fetch', function(event) {
    	if (event.request.url.indexOf(home) == 0) {
    		const responsePromise = waitCacheReady(event.clientId)
    			.then(() => tryUpdate(event.clientId))
    			.then(() => {
    				const _URL = formatURL(event.request.url);
    				const execStore = /\?cache\=onlyNet|\?cache\=onlyCache|\?cache\=netFirst|\?cache\=cacheFirst/.exec(event.request.url);
    				const storeKey = null == execStore ? "default" : execStore[0];
    				const waitResponse = {
    					"?cache=onlyNet": onlyNet,
    					"?cache=onlyCache": loadCache,
    					"?cache=netFirst": netFirst,
    					"?cache=cacheFirst": cacheFirst,
    					"default": cacheFirst
    				}[storeKey];
    				const execCacheKey = /\?cacheKey\=currentCache|\?cacheKey\=updataCache|\?cacheKey\=updateCache|\&cacheKey\=currentCache|\&cacheKey\=updataCache|\&cacheKey\=updateCache/.exec(event.request.url);
    				const cacheKey = null == execCacheKey ? "default" : execCacheKey[0];
    				const version = {
    					"?cacheKey=currentCache": currentCacheKey,
    					"?cacheKey=updataCache": updataCacheKey,
    					"?cacheKey=updateCache": updataCacheKey,
    					"&cacheKey=currentCache": currentCacheKey,
    					"&cacheKey=updataCache": updataCacheKey,
    					"&cacheKey=updateCache": updataCacheKey,
    					"default": currentCacheKey
    				}[cacheKey];
    				postMsg(`fetch Event url: ${decodeURIComponent(_URL)}`, event.clientId);
    				return waitResponse(_URL, version, event.clientId)
    					.then(response => addHTMLCode(response))
                		.then(response => supportSharedArrayBuffer(response))
    			})
    			.catch(e => {
    				return new Response(e ? JSON.stringify(e && e.stack || e && e.message || e || "sw.js fetch Event: Unknown error", null, 2) : response_err_data, response_404_init_data)
    			})
    			
    		event.respondWith(responsePromise);
    	}
    });
    
    //--------------------------  post message ---------------------------------
	
	const NUM_MAX_MSG = 1000;
	let delay = true;
	let delayMessages = [];
	let lastDelayMessages = new Date().getTime();
	let log2cacheTimer = setInterval(() => {
		if (5000 < new Date().getTime() - lastDelayMessages) {
			/*预防 serviceWorker 意外重启，关闭加载动画*/
			load.finish(null, currentClient);
			tryUpdate(currentClient);
			/*------------------------------------*/
			clearInterval(log2cacheTimer);
			postDelayMessages();
		}
	}, 1000)
		
	function delayMsg(msg, client) {
		(typeof msg == "object") && (msg = JSON.parse(JSON.stringify(msg)));
		lastDelayMessages = new Date().getTime();
		delayMessages.push({msg, client});
		delayMessages.length >= NUM_MAX_MSG && postDelayMessages();
	}
	
	function syncMsg(msg, client) {
		client = client || currentClient;
		if (client && typeof client.postMessage == "function") {
			client.postMessage(msg);
		}
		else {
			self.clients.matchAll().then(clients => clients.map(client => client.postMessage(msg)));
		}
	}
	
	function postMsg(msg, client) {
		if (!DEBUG_SERVER_WORKER && !(msg && msg.cmd)) return;
		delay ? delayMsg(msg, client) : syncMsg(msg, client);
	}
	
	function postDelayMessages() {
		let count = 0;
		let logStr = "";
		delay = false;
		while (delayMessages.length && count++ < NUM_MAX_MSG) {
			const { msg, client } = delayMessages.shift();
			postMsg(msg, client);
			logStr += (msg + "\n");
		}
		caches.open("log").then(cache => cache.put("log", new Response(logStr)))
	}
	
	//--------------------------  onmessage ---------------------------------
	
	function getArgs(data) {
		return Array.isArray(data.args) ? data.args : [data.args !== undefined ? data.args : data.arg]
	}
	
	const COMMAND = {
		formatURL: async (data, client) => {
		 	data["resolve"] = formatURL(...getArgs(data))
		},
		postDelayMessages: async (data, client) => {
			postDelayMessages();
			data["resolve"] = true
		},
		waitCacheReady: async (data, client) => {
			waitingCacheReady = undefined;
			currentVersionInfo = null;
			return waitCacheReady(client).then(() => data["resolve"] = true)
		},
		getCacheKeys: async (data, client) => {
			data["resolve"] = {currentCacheKey, updataCacheKey}
		},
		getVersionInfos: async (data, client) => {
			data["resolve"] = {scriptVersion, currentCacheKey, updataCacheKey, currentVersionInfo, updateVersionInfo}
		},
		refreshVersionInfos: async (data, client) => {
			return refreshVersionInfos(client).then(() => data["resolve"] = {scriptVersion, currentCacheKey, updataCacheKey, currentVersionInfo, updateVersionInfo})
		},
		updateCache: async (data, client) => {
		 	function progress(p) {
				postMsg({cmd: "progress", msg: {"progress": p}}, client)
			}
			return updateCache(client, progress).then(rt => data["resolve"] = rt)
		 },
		checkCache: async (data, client) => {
		 	return checkCache(client, ...getArgs(data)).then(rt => data["resolve"] = rt)
		},
		copyCache: async (data, client) => {
			if (waitingCopyCache || waitingMoveCache || waitingCopyToCurrentCache || waitingMoveToCurrentCache) {
				data["resolve"] = false;
				postMsg({cmd: "error", msg: "copyCache is in progress......"}, client)
			}
			else return copyCache(...getArgs(data)).then(rt => data["resolve"] = rt)
		},
		moveCache: async (data, client) => {
			if (waitingCopyCache || waitingMoveCache || waitingCopyToCurrentCache || waitingMoveToCurrentCache) {
				data["resolve"] = false;
				postMsg({cmd: "error", msg: "moveCache is in progress......"}, client)
			}
			else return moveCache(...getArgs(data)).then(rt => data["resolve"] = rt)
		},
		/*
		copyToCurrentCache: async (data, client) => {
			if (waitingCopyCache || waitingMoveCache || waitingCopyToCurrentCache || waitingMoveToCurrentCache) {
				data["resolve"] = false;
				postMsg({cmd: "error", msg: "copyToCurrentCache is in progress......"}, client)
			}
			else return copyToCurrentCache(client).then(rt => data["resolve"] = rt)
		},
		*/
		copyToCurrentCache: async (data, client) => {
			if (waitingCopyCache || waitingMoveCache || waitingCopyToCurrentCache || waitingMoveToCurrentCache) {
				data["resolve"] = false;
				postMsg({cmd: "error", msg: "moveToCurrentCache is in progress......"}, client)
			}
			else return moveToCurrentCache(client).then(rt => data["resolve"] = rt)
		},
		moveToCurrentCache: async (data, client) => {
			if (waitingCopyCache || waitingMoveCache || waitingCopyToCurrentCache || waitingMoveToCurrentCache) {
				data["resolve"] = false;
				postMsg({cmd: "error", msg: "moveToCurrentCache is in progress......"}, client)
			}
			else return moveToCurrentCache(client).then(rt => data["resolve"] = rt)
		},
	}
    
    self.addEventListener('message', function(event) {
    	const data = { cmd: event.data.cmd, time: event.data.time, args: event.data.args, arg: event.data.arg };
    	const client = event.clientId;
    	const fun = COMMAND[data.cmd];
    	if (typeof data == "object" && fun) {
    		fun(data, client)
    			.then(() => {
    				syncMsg(data, client)
    			})
    			.catch(e => postMsg({cmd: "error", msg: e && e.stack || e && e.message || JSON.stringify(e || `sw.js message event cmd "${data.cmd}" : Unknown error`) }))
    	}
    	else {
    		syncMsg(data, client)
    	}
    });
    
    //---------------------- load --------------------------------
    
    postMsg({
    	cmd: "log",
    	msg: `----- serviceWorker reboot -----\n\ttime: ${new Date().getTime()} \n\tScriptURL: ${new Request("./sw.js").url} \n\tScript Version: ${scriptVersion} \n\tcache Version: ${currentCacheKey}`
    });
    
    waitCacheReady(currentClient);
    loadUpdateVersionInfo(currentClient);
    localCache.getItem("lastRefreshTime").then(v => lastRefreshTime = (v && v * 1 || 0))
    localCache.getItem("createTime").then(v => v * 1 ? (createTime = v * 1) : (createTime = new Date().getTime(), localCache.setItem("createTime", createTime)))