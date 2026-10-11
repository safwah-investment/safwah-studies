
(function () {
  "use strict";
  var WHATSAPP = "966505189070";
  var T = function (ar, en) { return { ar: ar, en: en }; };
  var properties = [
    {
      id: 1, title: T("مخطط العذري – جشم", "Al-Udhri – Jashm"),
      subtitle: T("شرق المدينة المنورة", "East Madinah"), zone: "east",
      type: T("قطعتان سكنيتان متجاورتان", "Two adjoining residential plots"),
      plot: T("القطعتان 386 و387", "Plots 386 and 387"),
      area: 806.33, price: 1900000, sqm: 2356,
      configuration: T("رأس بلك من القطعتين 386 و387", "Corner-block position across plots 386 and 387"),
      roads: T("15م شمالي · 16م شرقي · 16م غربي", "15m north · 16m east · 16m west"),
      use: T("شقق سكنية", "Residential apartments"),
      note: T("قطعتان متجاورتان على رأس بلك. تعدد الواجهات قد يتيح مرونة في التطوير السكني مع مراعاة الأنظمة البلدية.", "Two adjacent plots at a corner-block location. Multiple frontages may offer development flexibility, subject to municipal rules."),
      lat: 24.4566564, lng: 39.6845853,
      mapLink: "https://maps.app.goo.gl/ZqGuaZtE7Byf5bcg6?g_st=ic"
    },
    {
      id: 2, title: T("طيبة – السلام", "Taibah – Al-Salam"),
      subtitle: T("غرب المدينة المنورة", "West Madinah"), zone: "west",
      type: T("أرض سكنية", "Residential land"),
      plot: T("القطعة 1036 – بلوك 4", "Plot 1036 – Block 4"),
      area: 903.24, price: 1716156, sqm: 1900,
      configuration: T("القطعة 1036، بلوك 4", "Plot 1036, Block 4"),
      roads: T("14م شرقًا · 12م جنوبًا", "14m east · 12m south"),
      use: T("سكني", "Residential"),
      note: T("يبعد الموقع نحو 130 مترًا عن طريق السلام وفق بيانات العرض. يلزم التحقق من الاشتراطات والتصاريح الخاصة بالبناء.", "Approximately 130m from Al-Salam Road per the brochure. Development permissions and setbacks require verification."),
      lat: 24.4905111, lng: 39.5187621,
      mapLink: "https://maps.app.goo.gl/tcq3W76qmb7n5ML98"
    },
    {
      id: 3, title: T("مخطط الردادي", "Al-Raddadi Plan"),
      subtitle: T("شرق المدينة المنورة", "East Madinah"), zone: "east",
      type: T("قطعتان سكنيتان معًا", "Two residential plots"),
      plot: T("أرض رأس بلك", "Corner-block plots"),
      area: 1200, price: 2760000, sqm: 2300,
      configuration: T("رأس بلك · قطعتان معًا", "Corner block · two plots"),
      roads: T("يظهر تقاطع شوارع في التصور المرفق", "Street intersection in the supplied site diagram"),
      use: T("مشروع سكني أو مجمع فلل", "Residential project or villa compound"),
      note: T("مساحة قدرها 1,200 م² على رأس بلك. المخطط الموضح في العرض تصور تقريبي، وليس مخططًا مساحيًا معتمدًا.", "The 1,200 sq. m. corner-block parcel is shown in an indicative diagram, not a certified cadastral plan."),
      lat: 24.4575747, lng: 39.67257,
      mapLink: "https://maps.app.goo.gl/swQBMaX4W9bTm2do8?g_st=ic"
    },
    {
      id: 4, title: T("الدويخلة – القطعة 6", "Al-Duwaikhilah – Plot 6"),
      subtitle: T("شرق المدينة المنورة", "East Madinah"), zone: "east",
      type: T("أرض سكنية زاوية", "Corner residential plot"),
      plot: T("القطعة 6 – بلوك 6", "Plot 6 – Block 6"),
      area: 806.18, price: 1600000, sqm: 1985,
      configuration: T("مخطط 950 · بلوك 6", "Plan 950 · Block 6"),
      roads: T("زاوية على شارعين", "Two street frontages"),
      use: T("شقق سكنية", "Residential apartments"),
      note: T("السعر المطلوب 1,600,000 ريال صافي وفق الملف. سعر المتر الوارد بالعرض تقريبي؛ وليس ناتج قسمة السعر الصافي بالضرورة.", "The brochure gives a net asking price of SAR 1,600,000. Its quoted per-square-meter figure is indicative and may differ from the net-price calculation."),
      lat: 24.4942909, lng: 39.6834534,
      mapLink: "https://maps.app.goo.gl/YqgrqRzoQeydMTm68?g_st=ic"
    },
    {
      id: 5, title: T("الدويخلة – القطعة 5194", "Al-Duwaikhilah – Plot 5194"),
      subtitle: T("شرق المدينة المنورة", "East Madinah"), zone: "east",
      type: T("أرض سكنية", "Residential land"),
      plot: T("القطعة 5194", "Plot 5194"),
      area: 981.81, price: 1472715, sqm: 1500,
      configuration: T("مخطط 0599/د/1413 حسب العرض", "Plan 0599/D/1413 as shown in brochure"),
      roads: T("شارع 24م · شارع 30م", "24m road · 30m road"),
      use: T("سكني", "Residential"),
      note: T("تقع القطعة على شارعين بعرض 24 و30 مترًا حسب الملف. القيمة المذكورة تقريبية وتتوافق مع 1,500 ريال للمتر.", "The brochure shows access to 24m and 30m roads. The indicative asking value equals SAR 1,500 per sq. m."),
      lat: 24.50072947763299, lng: 39.67846949018607,
      mapLink: "https://www.google.com/maps?q=24.50072947763299,39.67846949018607"
    }
  ];
  var state = {lang:"ar",search:"",zone:"all",sort:"default",selected:[],active:null};
  try { state.lang = localStorage.getItem("safwah-opportunities-lang") === "en" ? "en" : "ar"; } catch(e) {}
  var mainMap = null, miniMaps = [], detailMap = null, markers = {}, tileLayer = null, activeBase = "satellite", observer = null, previousFocus = null;
  var $ = function (id) { return document.getElementById(id); };
  var tr = function (ar, en) { return state.lang === "ar" ? ar : en; };
  var val = function (dict) { return dict[state.lang]; };
  var number = function (n, digits) { return Number(n).toLocaleString(state.lang === "ar" ? "en-US" : "en-US", {maximumFractionDigits:digits == null ? 2 : digits, minimumFractionDigits:0}); };
  var byId = function (id) { return properties.find(function (p) { return p.id === Number(id); }); };
  var textNode = function (tag, cls, content) {
    var elem = document.createElement(tag);
    if (cls) elem.className = cls;
    elem.textContent = content;
    return elem;
  };
  var link = function (href, label, cls) {
    var a = textNode("a", cls || "", label);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  };
  var button = function (text, action, id, cls, pressed) {
    var b = textNode("button", cls || "", text);
    b.type = "button";
    b.dataset.action = action;
    b.dataset.id = String(id);
    if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
    return b;
  };
  var whatsAppLink = function (p) {
    var message = tr(
      "السلام عليكم، أود الاستفسار عن الفرصة العقارية رقم " + p.id + " (" + p.title.ar + ") بمساحة " + number(p.area) + " م²، والسعر المعلن " + number(p.price,0) + " ريال.",
      "Hello, I would like to inquire about Safwah property opportunity #" + p.id + " (" + p.title.en + "), " + number(p.area) + " sq. m., asking price SAR " + number(p.price,0) + "."
    );
    return "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(message);
  };
  var filteredProperties = function () {
    var term = state.search.toLowerCase().trim();
    var list = properties.filter(function (p) {
      if (state.zone !== "all" && p.zone !== state.zone) return false;
      if (!term) return true;
      var haystack = [p.title.ar,p.title.en,p.subtitle.ar,p.subtitle.en,p.plot.ar,p.plot.en,p.type.ar,p.type.en,String(p.id),String(p.area),String(p.price)].join(" ").toLowerCase();
      return haystack.indexOf(term) > -1;
    });
    if (state.sort === "priceAsc") list.sort(function(a,b){return a.price-b.price;});
    if (state.sort === "priceDesc") list.sort(function(a,b){return b.price-a.price;});
    if (state.sort === "areaDesc") list.sort(function(a,b){return b.area-a.area;});
    if (state.sort === "sqmAsc") list.sort(function(a,b){return a.sqm-b.sqm;});
    return list;
  };
  var updateHero = function () {
    $("total-offers").textContent = properties.length;
    $("total-area").textContent = number(properties.reduce(function (sum,p) { return sum+p.area; },0),2);
    $("price-range").textContent = number(Math.min.apply(null,properties.map(function(p){return p.price;})),0) + " – " + number(Math.max.apply(null,properties.map(function(p){return p.price;})),0);
  };
  var showToast = function (message) {
    var toast = $("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function(){toast.classList.remove("visible");},2700);
  };
  var satelliteTile = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  var streetTile = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  var satelliteAttribution = 'Tiles &copy; Esri and contributors';
  var streetAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
  var miniOverlay = function (map,p) {
    L.circleMarker([p.lat,p.lng],{radius:7,weight:3,color:"#fff",fillColor:"#d7ab46",fillOpacity:1,interactive:false}).addTo(map);
  };
  var createMini = function (target,p) {
    if (!window.L || !target || target.dataset.loaded) return;
    target.dataset.loaded = "yes";
    var m = L.map(target,{zoomControl:false,attributionControl:false,keyboard:false,dragging:false,doubleClickZoom:false,scrollWheelZoom:false,boxZoom:false, touchZoom:false,tap:false,zoomAnimation:false,fadeAnimation:false});
    L.tileLayer(satelliteTile,{maxZoom:19,maxNativeZoom:18}).addTo(m);
    m.setView([p.lat,p.lng],17);
    miniOverlay(m,p);
    miniMaps.push(m);
    setTimeout(function(){m.invalidateSize(false);},110);
  };
  var setupMiniMaps = function () {
    if (observer) { observer.disconnect(); observer = null; }
    miniMaps.forEach(function (m) { try { m.remove(); } catch(e) {} });
    miniMaps = [];
    if (!window.L) return;
    var targets = document.querySelectorAll("[data-mini-map]");
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function(entry){
          if (entry.isIntersecting) {
            createMini(entry.target,byId(entry.target.dataset.miniMap));
            observer.unobserve(entry.target);
          }
        });
      },{rootMargin:"300px 0px"});
      targets.forEach(function(t){observer.observe(t);});
    } else {
      targets.forEach(function(t){createMini(t,byId(t.dataset.miniMap));});
    }
  };
  var createCard = function (p) {
    var card = document.createElement("article");
    card.className = "property-card";
    card.id = "offer-" + p.id;
    card.setAttribute("aria-label",val(p.title));
    var media = textNode("div","card-media","");
    var thumb = textNode("div","card-map","");
    thumb.dataset.miniMap = String(p.id);
    thumb.setAttribute("aria-hidden","true");
    media.appendChild(thumb);
    media.appendChild(textNode("div","media-vignette",""));
    media.appendChild(textNode("span","property-id",tr("الفرصة ", "OFFER ") + String(p.id).padStart(2,"0")));
    var mediaLabel = textNode("div","media-label",val(p.title));
    mediaLabel.appendChild(textNode("small","",val(p.subtitle)));
    media.appendChild(mediaLabel);
    card.appendChild(media);
    var content = textNode("div","card-content","");
    var head = textNode("div","card-head","");
    var headLeft = textNode("div","","");
    headLeft.appendChild(textNode("span","card-serial","PROPERTY / " + String(p.id).padStart(2,"0")));
    headLeft.appendChild(textNode("h3","card-title",val(p.title)));
    head.appendChild(headLeft);
    head.appendChild(textNode("span","card-area-tag",p.zone === "east" ? tr("شرق المدينة","East") : tr("غرب المدينة","West")));
    content.appendChild(head);
    var facts = textNode("div","card-facts","");
    [
      [tr("المساحة","Land area"),number(p.area,2)+" "+tr("م²","m²")],
      [tr("سعر المتر المعلن","Quoted / m²"),number(p.sqm,0)+" "+tr("ر.س","SAR")],
      [tr("القطعة / التكوين","Plot / type"),val(p.plot)],
      [tr("الواجهة","Frontage"),val(p.roads)]
    ].forEach(function(f){
      var d = textNode("div","fact","");
      d.appendChild(textNode("span","",f[0]));
      d.appendChild(textNode("strong","",f[1]));
      facts.appendChild(d);
    });
    content.appendChild(facts);
    var price = textNode("div","price-row","");
    var priceCont = textNode("div","","");
    priceCont.appendChild(textNode("span","price-caption",tr("السعر المطلوب","Asking price")));
    priceCont.appendChild(textNode("strong","property-price",number(p.price,0)));
    price.appendChild(priceCont);
    price.appendChild(textNode("span","currency",tr("ريال سعودي","SAR")));
    content.appendChild(price);
    var actions = textNode("div","card-actions","");
    actions.appendChild(button(tr("التفاصيل","Details"),"details",p.id,"detail-btn"));
    actions.appendChild(button(tr("حدد الموقع","Locate"),"locate",p.id,"locate-btn"));
    actions.appendChild(link(p.mapLink,tr("Google Maps ↗","Google Maps ↗"),"maps-btn"));
    var selected = state.selected.indexOf(p.id) >= 0;
    actions.appendChild(button(selected ? tr("✓ للمقارنة","✓ Selected") : tr("+ مقارنة","+ Compare"),"compare",p.id,"compare-btn"+(selected ? " is-selected" : ""),selected));
    content.appendChild(actions);
    card.appendChild(content);
    return card;
  };
  var renderCards = function () {
    var list = filteredProperties();
    var cards = $("cards");
    cards.replaceChildren();
    list.forEach(function (p) { cards.appendChild(createCard(p)); });
    if (!list.length) cards.appendChild(textNode("p","empty-results",tr("لا توجد نتائج مطابقة. غيّر كلمات البحث أو إعدادات التصفية.","No matching properties. Adjust the search or filters.")));
    $("result-count").textContent = tr("عدد النتائج: ","Results: ") + list.length + " / " + properties.length;
    setupMiniMaps();
    updateMapMarkers(list);
  };
  var detailRow = function (grid,k,v) {
    var item = textNode("div","detail-item","");
    item.appendChild(textNode("span","",k));
    item.appendChild(textNode("strong","",v));
    grid.appendChild(item);
  };
  var initDetailMap = function(p) {
    if(!window.L) return;
    detailMap=L.map("detail-map-inner",{zoomControl:true,scrollWheelZoom:false});
    L.tileLayer(satelliteTile,{maxZoom:19,maxNativeZoom:18,attribution:satelliteAttribution}).addTo(detailMap);
    detailMap.setView([p.lat,p.lng],18);
    miniOverlay(detailMap,p);
    setTimeout(function(){if(detailMap)detailMap.invalidateSize(false);},160);
  };
  var openDetails = function(id) {
    var p=byId(id);
    if(!p)return;
    state.active=p.id;
    previousFocus=document.activeElement;
    $("detail-heading").textContent=val(p.title);
    var body=$("detail-body");
    body.replaceChildren();
    var top=textNode("div","detail-top","");
    var summary=textNode("div","detail-summary","");
    summary.appendChild(textNode("p","detail-description",val(p.type)+" — "+val(p.subtitle)));
    summary.appendChild(textNode("div","detail-price",number(p.price,0)+" "+tr("ريال","SAR")));
    var details=textNode("div","detail-grid","");
    detailRow(details,tr("المساحة","Area"),number(p.area,2)+" "+tr("م²","m²"));
    detailRow(details,tr("سعر المتر المعلن","Quoted per sq. m."),number(p.sqm,0)+" "+tr("ريال","SAR"));
    detailRow(details,tr("رقم القطعة","Plot"),val(p.plot));
    detailRow(details,tr("التكوين / المخطط","Configuration / plan"),val(p.configuration));
    detailRow(details,tr("الواجهات والشوارع","Road frontages"),val(p.roads));
    detailRow(details,tr("الاستخدام المقترح","Suggested use"),val(p.use));
    summary.appendChild(details);
    summary.appendChild(textNode("p","detail-note",val(p.note)));
    var coords=textNode("p","map-disclaimer",tr("الموقع المثبت على الخريطة: ","Map pin: ")+p.lat.toFixed(6)+", "+p.lng.toFixed(6)+". "+tr("الدبوس لا يحدد حدود العقار.","The pin does not define parcel boundaries."));
    summary.appendChild(coords);
    var mapWrapper=textNode("div","detail-map","");
    mapWrapper.id="detail-map-inner";
    mapWrapper.setAttribute("aria-label",tr("موقع العقار على خريطة القمر الصناعي","Property satellite map"));
    top.appendChild(summary);
    top.appendChild(mapWrapper);
    body.appendChild(top);
    var actions=textNode("div","detail-actions","");
    actions.appendChild(link(whatsAppLink(p),tr("استفسار واتساب ↗","WhatsApp inquiry ↗"),"primary"));
    actions.appendChild(link(p.mapLink,tr("فتح Google Maps ↗","Open Google Maps ↗"),""));
    actions.appendChild(button(tr("مشاركة الرابط","Share listing"),"share",p.id,""));
    body.appendChild(actions);
    $("detail-overlay").hidden=false;
    document.body.style.overflow="hidden";
    $("detail-close").focus();
    requestAnimationFrame(function(){initDetailMap(p);});
    try{history.replaceState(null,"","#offer-"+p.id);}catch(e){}
  };
  var closeDetails = function () {
    if($("detail-overlay").hidden)return;
    $("detail-overlay").hidden=true;
    document.body.style.overflow="";
    if(detailMap){try{detailMap.remove();}catch(e){}detailMap=null;}
    state.active=null;
    if(previousFocus && document.contains(previousFocus)) previousFocus.focus();
  };
  var selectOfferOnMap = function (p) {
    if (!p) return;
    var mapSection=$("map-section");
    mapSection.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    if(mainMap){
      mainMap.setView([p.lat,p.lng],16,{animate:true});
      if(markers[p.id]) markers[p.id].openPopup();
      setTimeout(function(){mainMap.invalidateSize(false);},250);
    } else {
      showToast(tr("تعذر تحميل الخريطة. استخدم رابط Google Maps في بطاقة العقار.","Interactive map unavailable. Use the card's Google Maps link."));
    }
  };
  var toggleComparison = function (id) {
    var at=state.selected.indexOf(id);
    if(at>=0) state.selected.splice(at,1);
    else if(state.selected.length>=3) {showToast(tr("يمكن مقارنة ثلاث فرص كحد أقصى.","Select up to three properties to compare."));return;}
    else state.selected.push(id);
    renderCards();
    renderComparison();
  };
  var compareRows = function (selected) {
    return [
      [tr("الموقع","Location"),function(p){return val(p.subtitle);}],
      [tr("المساحة","Area"),function(p){return number(p.area,2)+" "+tr("م²","m²");}],
      [tr("السعر المطلوب","Asking price"),function(p){return number(p.price,0)+" "+tr("ريال","SAR");}],
      [tr("سعر المتر المعلن","Quoted / m²"),function(p){return number(p.sqm,0)+" "+tr("ريال","SAR");}],
      [tr("القطعة / التكوين","Plot"),function(p){return val(p.plot);}],
      [tr("الواجهات","Frontages"),function(p){return val(p.roads);}],
      [tr("الاستخدام","Use"),function(p){return val(p.use);}]
    ];
  };
  var renderComparison = function () {
    var selected=state.selected.map(byId).filter(Boolean);
    $("comparison").hidden=selected.length===0;
    $("compare-tray").hidden=selected.length===0;
    $("compare-tray-status").textContent=tr("تم اختيار ","Selected ")+selected.length+tr(" من 3 فرص"," of 3 listings");
    var target=$("comparison-table");
    target.replaceChildren();
    if(!selected.length)return;
    var table=textNode("table","comparison-table","");
    var thead=document.createElement("thead");
    var headrow=document.createElement("tr");
    headrow.appendChild(textNode("th","",tr("البند","Item")));
    selected.forEach(function (p) {
      var cell=document.createElement("th");
      var a=textNode("a","",val(p.title));
      a.href="#offer-"+p.id;
      a.addEventListener("click",function(ev){ev.preventDefault();openDetails(p.id);});
      cell.appendChild(a);
      headrow.appendChild(cell);
    });
    thead.appendChild(headrow);table.appendChild(thead);
    var tbody=document.createElement("tbody");
    compareRows(selected).forEach(function(row){
      var trEl=document.createElement("tr");
      trEl.appendChild(textNode("th","",row[0]));
      selected.forEach(function (p) {trEl.appendChild(textNode("td","",row[1](p)));});
      tbody.appendChild(trEl);
    });
    var actionRow=document.createElement("tr");
    actionRow.appendChild(textNode("th","",tr("الخريطة","Map")));
    selected.forEach(function (p) {
      var td=document.createElement("td");
      td.appendChild(link(p.mapLink,tr("عرض الموقع ↗","View location ↗")));
      actionRow.appendChild(td);
    });
    tbody.appendChild(actionRow);table.appendChild(tbody);target.appendChild(table);
  };
  var makePin = function(p) {
    return L.divIcon({className:"property-pin",html:'<b style="transform:none">'+p.id+"</b>",iconSize:[34,34],iconAnchor:[17,32],popupAnchor:[0,-28]});
  };
  var markerPopup = function(p) {
    var safeUrl=p.mapLink.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
    return '<div class="popup-title">'+val(p.title)+'</div><div class="popup-small">'+number(p.area,2)+" "+tr("م²","m²")+" · "+number(p.price,0)+" "+tr("ريال","SAR")+'</div><button class="link-btn" type="button" data-action="details" data-id="'+p.id+'">'+tr("عرض التفاصيل","View details")+'</button> · <a href="'+safeUrl+'" target="_blank" rel="noopener noreferrer">'+tr("Google Maps ↗","Google Maps ↗")+"</a>";
  };
  var initMap = function () {
    if (!window.L) {$("map-fallback").hidden=false;return;}
    try{
      mainMap=L.map("map",{scrollWheelZoom:false,zoomControl:true,preferCanvas:true});
      tileLayer=L.tileLayer(satelliteTile,{maxZoom:19,maxNativeZoom:18,attribution:satelliteAttribution}).addTo(mainMap);
      var streets=L.tileLayer(streetTile,{maxZoom:19,attribution:streetAttribution});
      L.control.layers(
        { [tr("صور الأقمار الصناعية","Satellite")]:tileLayer,[tr("خريطة الشوارع","Streets")]:streets },
        {},
        {collapsed:false,position:"bottomright"}
      ).addTo(mainMap);
      mainMap.on("baselayerchange",function(e){activeBase=e.name===tr("صور الأقمار الصناعية","Satellite")?"satellite":"streets";});
      updateMapMarkers(filteredProperties());
      setTimeout(function(){mainMap.invalidateSize(false);},160);
    }catch(e){console.warn("Map unavailable:",e);$("map-fallback").hidden=false;}
  };
  var updateMapMarkers = function(list) {
    if(!mainMap || !window.L)return;
    Object.keys(markers).forEach(function(id){mainMap.removeLayer(markers[id]);});
    markers={};
    var bounds=[];
    list.forEach(function(p){
      var m=L.marker([p.lat,p.lng],{icon:makePin(p),title:val(p.title),alt:val(p.title)}).addTo(mainMap);
      m.bindPopup(markerPopup(p),{maxWidth:235});
      markers[p.id]=m;
      bounds.push([p.lat,p.lng]);
    });
    if(bounds.length>1) mainMap.fitBounds(bounds,{padding:[25,25],maxZoom:15});
    else if(bounds.length===1) mainMap.setView(bounds[0],15);
    else mainMap.setView([24.48,39.63],11);
  };
  var updateTranslations = function() {
    document.documentElement.lang=state.lang;
    document.documentElement.dir=state.lang==="ar"?"rtl":"ltr";
    document.title=tr("الفرص العقارية | صفوة الاستثمارية","Property Opportunities | Safwah Investment");
    document.querySelectorAll("[data-ar]").forEach(function(elem){
      var raw=elem.getAttribute("data-"+state.lang);
      if(raw.indexOf("<br>")>-1){elem.innerHTML=raw;}else{elem.textContent=raw;}
    });
    document.querySelectorAll("[data-placeholder-ar]").forEach(function(elem){elem.placeholder=elem.getAttribute("data-placeholder-"+state.lang);});
    $("lang-btn").textContent=state.lang==="ar"?"English":"العربية";
    var generalText=tr("السلام عليكم، أود الاستفسار عن العروض العقارية لدى صفوة الاستثمارية.","Hello, I would like to inquire about Safwah property opportunities.");
    $("general-contact").href="https://wa.me/"+WHATSAPP+"?text="+encodeURIComponent(generalText);
    updateHero();
    renderCards();
    renderComparison();
    if(mainMap) {
      try {mainMap.remove();}catch(e){}
      mainMap=null;markers={};initMap();
    }
    try{localStorage.setItem("safwah-opportunities-lang",state.lang);}catch(e){}
  };
  var shareListing = function(id) {
    var p=byId(id);
    if(!p)return;
    var url=location.origin+location.pathname+"#offer-"+p.id;
    var title=val(p.title);
    if(navigator.share){navigator.share({title:title,url:url}).catch(function(){});return;}
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){showToast(tr("تم نسخ رابط العقار","Property link copied"));},function(){fallbackCopy(url);});
    } else fallbackCopy(url);
  };
  var fallbackCopy = function(str){
    var elem=document.createElement("textarea");
    elem.value=str;elem.style.position="fixed";elem.style.opacity="0";
    document.body.appendChild(elem);
    elem.select();
    try {document.execCommand("copy");showToast(tr("تم نسخ الرابط","Link copied"));}catch(e){showToast(str);}
    elem.remove();
  };
  var initEvents = function () {
    $("search-input").addEventListener("input",function(e){state.search=e.target.value;renderCards();});
    $("area-filter").addEventListener("change",function(e){state.zone=e.target.value;renderCards();});
    $("sort-filter").addEventListener("change",function(e){state.sort=e.target.value;renderCards();});
    $("filters").addEventListener("reset",function(){state.search="";state.zone="all";state.sort="default";setTimeout(renderCards,0);});
    $("lang-btn").addEventListener("click",function(){state.lang=state.lang==="ar"?"en":"ar";updateTranslations();});
    $("clear-comparison").addEventListener("click",function(){state.selected=[];renderCards();renderComparison();});
    $("detail-close").addEventListener("click",closeDetails);
    $("detail-overlay").addEventListener("click",function(ev){if(ev.target===$("detail-overlay"))closeDetails();});
    document.addEventListener("click",function(event) {
      var item=event.target.closest("[data-action]");
      if(!item)return;
      var id=Number(item.dataset.id);
      var action=item.dataset.action;
      if(action==="details")openDetails(id);
      if(action==="locate")selectOfferOnMap(byId(id));
      if(action==="compare")toggleComparison(id);
      if(action==="share")shareListing(id);
    });
    document.addEventListener("keydown",function(event) {
      if($("detail-overlay").hidden)return;
      if(event.key==="Escape"){closeDetails();return;}
      if(event.key!=="Tab")return;
      var focusables=Array.prototype.slice.call($("detail-overlay").querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex]:not([tabindex="-1"])')).filter(function(x){return x.getClientRects().length>0;});
      if(!focusables.length)return;
      var first=focusables[0],last=focusables[focusables.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    window.addEventListener("resize",function(){if(mainMap)mainMap.invalidateSize(false);if(detailMap)detailMap.invalidateSize(false);});
    window.addEventListener("hashchange",function() {
      var match=location.hash.match(/^#offer-(\d+)$/);
      if(match&&!state.active)openDetails(Number(match[1]));
    });
  };
  function boot() {
    if(!$("cards"))return;
    updateHero();
    initEvents();
    updateTranslations();
    initMap();
    var match=location.hash.match(/^#offer-(\d+)$/);
    if(match)setTimeout(function(){openDetails(Number(match[1]));},300);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
