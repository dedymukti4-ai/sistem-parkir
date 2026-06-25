const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwTLCylAvFtcGlQrBX4HpukOe6IH_GXPWynO1OUKX05LTe-inwl68VYk3ujVReptNk/exec';

function callGas(action, args, onSuccess, onFailure) {
  if (!onFailure) {
    onFailure = function(err) { hideLoader(); alert(err); };
  }
  fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, args: args })
  })
  .then(function(res) { return res.json(); })
  .then(function(res) {
    if (res.status === 'success') {
      if(onSuccess) onSuccess(res.data);
    } else {
      onFailure(res.message);
    }
  })
  .catch(function(err) {
    onFailure("Network Error: " + err.message);
  });
}

function makeGasProxy(successCb, failCb) {
  return new Proxy({}, {
    get: function(target, prop) {
      return function(...args) {
        callGas(prop, args, successCb, failCb);
      };
    }
  });
}

const google = {
  script: {
    run: new Proxy({}, {
      get: function(target, prop) {
        if (prop === 'withSuccessHandler') {
          return function(successCb) {
            return new Proxy({}, {
              get: function(target2, prop2) {
                if (prop2 === 'withFailureHandler') {
                  return function(failCb) {
                    return makeGasProxy(successCb, failCb);
                  };
                }
                return function(...args) {
                  callGas(prop2, args, successCb, null);
                };
              }
            });
          };
        }
        return function(...args) {
          callGas(prop, args, function(){}, null);
        };
      }
    })
  }
};

// Initial logo fetch
document.addEventListener("DOMContentLoaded", function() {
  callGas('getLogo', [], function(res) {
    if(res) {
      const img = document.querySelector('.sidebar-logo');
      const imgInv = document.getElementById('invoice-logo-img');
      if(img) img.src = res;
      if(imgInv) imgInv.src = res;
    }
  });
});



// State Management
var currentUser = null;
var productsCache = [];
var membersCache = [];
var historyCache = [];
var activeCharts = {};

// Pagination States
var memberPage = 1;
var memberPageSize = 100;
var filteredMembers = [];

var historyPage = 1;
var historyPageSize = 100;
var filteredHistory = [];

// Clock & Loading Controllers
function showLoader(text) {
  document.getElementById("loading-text").innerText = text || "Memuat data...";
  document.getElementById("loading-screen").style.display = "flex";
}

function hideLoader() {
  document.getElementById("loading-screen").style.display = "none";
}

// Clock updates
setInterval(function() {
  var now = new Date();
  var dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  var timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
  var dateStr = now.toLocaleDateString('id-ID', dateOptions);
  var timeStr = now.toLocaleTimeString('id-ID', timeOptions);
  document.getElementById("realtime-clock").innerHTML = dateStr + '<br><span style="color: var(--accent-primary); font-weight: bold; font-size: 14px;">' + timeStr + '</span>';
}, 1000);

// Initialize Page
window.onload = function() {
  // Load saved theme
  var savedTheme = localStorage.getItem("parking_theme");
  if (savedTheme === "light") {
    document.body.classList.add("light-mode");
    document.getElementById("theme-icon").innerText = "dark_mode";
  }

  // Check if session exists in sessionStorage
  var savedUser = sessionStorage.getItem("parking_session");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    setupAppSession();
  } else {
    hideLoader();
  }
};

/**
 * A. AUTHENTICATION FLOW
 */
function handleLoginSubmit(event) {
  event.preventDefault();
  var u = document.getElementById("login-username").value.trim();
  var p = document.getElementById("login-password").value;
  var errDiv = document.getElementById("login-error");
  
  errDiv.style.display = "none";
  showLoader("Memverifikasi login...");
  
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        currentUser = { username: res.username, role: res.role, allowedMenus: res.allowedMenus };
        sessionStorage.setItem("parking_session", JSON.stringify(currentUser));
        setupAppSession();
      } else {
        errDiv.innerText = res.message;
        errDiv.style.display = "block";
      }
    })
    .withFailureHandler(function(err) {
      hideLoader();
      errDiv.innerText = "Koneksi gagal: " + err.message;
      errDiv.style.display = "block";
    })
    .checkLogin(u, p);
}

function setupAppSession() {
  document.getElementById("login-page").style.display = "none";
  document.getElementById("app-container").style.display = "flex";
  
  // Set User Profile Elements
  document.getElementById("user-display-name").innerText = currentUser.username;
  document.getElementById("user-display-role").innerText = currentUser.role;
  document.getElementById("user-avatar").innerText = currentUser.username.substring(0, 1).toUpperCase();
  
  // Show / Hide Super Admin Only Menus
  if (currentUser.role === "Super Admin") {
    document.getElementById("menu-users").style.display = "flex";
    var auditLogMenu = document.getElementById("menu-auditlog");
    if(auditLogMenu) auditLogMenu.style.display = "flex";
  } else {
    document.getElementById("menu-users").style.display = "none";
    var auditLogMenu = document.getElementById("menu-auditlog");
    if(auditLogMenu) auditLogMenu.style.display = "none";
  }
  
  // Hide unauthorized menus
  var allowed = currentUser.allowedMenus;
  if (allowed && allowed !== "ALL") {
    var allowedList = allowed.split(",");
    document.querySelectorAll(".menu-item").forEach(function(item) {
      if (item.id === "menu-users" || item.id === "menu-auditlog") return; // Handled above
      // Get the onclick target viewName. e.g. navigateTo('produk', this)
      var onclickStr = item.getAttribute("onclick") || "";
      var match = onclickStr.match(/navigateTo\(['"]([^'"]+)['"]/);
      if (match && match[1]) {
        var viewName = match[1];
        if (allowedList.indexOf(viewName) === -1) {
          item.style.display = "none";
        } else {
          item.style.display = "flex";
        }
      }
    });
  } else {
    // Show all if ALL
    document.querySelectorAll(".menu-item").forEach(function(item) {
      if (item.id !== "menu-users" && item.id !== "menu-auditlog") item.style.display = "flex";
    });
  }
  
  // Refresh clock and navigation
  navigateTo("dashboard", document.querySelector(".menu-item"));
  initApp();
}

function handleLogout() {
  showLoader("Keluar dari sistem...");
  google.script.run.logActivity(currentUser.username, "Logout", "Successful logout session ended.");
  sessionStorage.removeItem("parking_session");
  currentUser = null;
  
  // Clear forms
  document.getElementById("login-form").reset();
  document.getElementById("login-page").style.display = "flex";
  document.getElementById("app-container").style.display = "none";
  hideLoader();
}

/**
 * B. APP NAVIGATION & ROUTER
 */
function navigateTo(viewName, el) {
  // Remove active sidebar state
  document.querySelectorAll(".menu-item").forEach(function(item) {
    item.classList.remove("active");
  });
  if (el) el.classList.add("active");
  
  // Hide all view containers
  document.querySelectorAll(".page-view").forEach(function(view) {
    view.style.display = "none";
  });
  
  // Show active view container
  var viewEl = document.getElementById("page-" + viewName);
  if (viewEl) viewEl.style.display = "block";
  
  // Format Title bar
  var titleMap = {
    "dashboard": "Dashboard Utama",
    "produk": "Master Produk & Tarif",
    "member-baru": "Pendaftaran Member Baru",
    "perpanjangan": "Perpanjangan Kontrak Member",
    "ganti-plat": "Ganti Plat Nomor Kendaraan",
    "ganti-kartu": "Penjualan / Penggantian Kartu",
    "casual": "Input Pendapatan Casual Harian",
    "member-data": "Database Seluruh Member",
    "history": "Audit Log & History Transaksi",
    "laporan": "Rekapitulasi Laporan Inter Parking",
    "users": "Kelola Hak Akses Pengguna"
  };
  document.getElementById("page-current-title").innerText = titleMap[viewName] || "Inter Parking";
  
  // Close mobile sidebar if open
  document.getElementById("app-sidebar").classList.remove("open");
  
  // Specific page logic initialization
  if (viewName === "produk") fetchProducts();
  if (viewName === "member-data") fetchMembers();
  if (viewName === "history") fetchHistory();
  if (viewName === "auditlog") fetchAuditLog();
  if (viewName === "users") fetchUsers();
  if (viewName === "dashboard") refreshDashboard();
  
  // Enforce viewer role restrictions
  enforceRolePermissions();
}

function toggleSidebar() {
  document.getElementById("app-sidebar").classList.toggle("open");
}

function toggleSidebarDesktop() {
  document.getElementById("app-sidebar").classList.toggle("collapsed");
  document.querySelector(".main-wrapper").classList.toggle("sidebar-collapsed");
}

function toggleTheme() {
  var isLight = document.body.classList.toggle("light-mode");
  var icon = document.getElementById("theme-icon");
  if (isLight) {
    icon.innerText = "dark_mode";
    localStorage.setItem("parking_theme", "light");
  } else {
    icon.innerText = "light_mode";
    localStorage.setItem("parking_theme", "dark");
  }
}

function enforceRolePermissions() {
  if (currentUser && currentUser.role === "Viewer") {
    // Disable or hide submission controls on Viewer accounts
    document.querySelectorAll(".btn-primary, .btn-success, .btn-danger, input[type='submit'], button[type='submit']").forEach(function(btn) {
      if (btn.innerText.indexOf("Cari") === -1 && btn.innerText.indexOf("Tampilkan") === -1 && btn.innerText.indexOf("Print") === -1 && btn.innerText.indexOf("Drive") === -1) {
        btn.style.display = "none";
      }
    });
  }
}

/**
 * C. DATA SINKRONISASI API CALLS
 */
function initApp() {
  showLoader("Memuat data dasar...");
  google.script.run
    .withSuccessHandler(function(prods) {
      productsCache = prods;
      populateProductDropdowns();
      refreshDashboard();
    })
    .getProducts();
}

function applyDashboardFilter() {
  refreshDashboard();
}

function resetDashboardFilter() {
  document.getElementById("dash-filter-start").value = "";
  document.getElementById("dash-filter-end").value = "";
  document.getElementById("dash-filter-type").value = "";
  refreshDashboard();
}

function setQuickFilter(type) {
  var d = new Date();
  var start, end;
  
  function pad(n) { return n < 10 ? '0' + n : n; }
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  
  if (type === 'thisMonth') {
    start = y + '-' + pad(m) + '-01';
    var lastDay = new Date(y, m, 0).getDate();
    end = y + '-' + pad(m) + '-' + pad(lastDay);
  } else if (type === 'last30Days') {
    var d30 = new Date(d);
    d30.setDate(d30.getDate() - 30);
    start = d30.getFullYear() + '-' + pad(d30.getMonth() + 1) + '-' + pad(d30.getDate());
    end = y + '-' + pad(m) + '-' + pad(d.getDate());
  } else if (type === 'thisYear') {
    start = y + '-01-01';
    end = y + '-12-31';
  }
  
  document.getElementById("dash-filter-start").value = start;
  document.getElementById("dash-filter-end").value = end;
  refreshDashboard();
}

function refreshDashboard() {
  showLoader("Mengambil data dashboard...");
  
  var filterOptions = null;
  var startEl = document.getElementById("dash-filter-start");
  var endEl = document.getElementById("dash-filter-end");
  var typeEl = document.getElementById("dash-filter-type");
  
  if (startEl && (startEl.value || endEl.value || typeEl.value)) {
    filterOptions = {
      startDate: startEl.value,
      endDate: endEl.value,
      txType: typeEl.value
    };
  }
  
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      updateDashboardStats(res.stats);
      renderDashboardCharts(res.charts);
    })
    .getDashboardData(filterOptions);
}

function updateDashboardStats(stats) {
  document.getElementById("dash-active-members").innerText = stats.totalActiveMembers;
  document.getElementById("dash-expired-members").innerText = stats.totalExpiredMembers;
  document.getElementById("dash-casual-today").innerText = stats.casualQtyToday;
  document.getElementById("dash-tx-today").innerText = stats.txCountToday;
  
  document.getElementById("dash-income-today").innerText = "Rp " + stats.incomeToday.toLocaleString("id-ID");
  document.getElementById("dash-income-week").innerText = "Rp " + stats.incomeWeekly.toLocaleString("id-ID");
  document.getElementById("dash-income-month").innerText = "Rp " + stats.incomeMonthly.toLocaleString("id-ID");
  document.getElementById("dash-income-year").innerText = "Rp " + stats.incomeYearly.toLocaleString("id-ID");
}

function renderDashboardCharts(chartsData) {
  // Destroy existing charts to prevent overlaps on redraw
  for (var key in activeCharts) {
    if (activeCharts[key]) activeCharts[key].destroy();
  }
  
  // 1. Daily Income Chart
  var monthlyLabels = Object.keys(chartsData.dailyIncome || {}).sort();
  var monthlyValues = monthlyLabels.map(function(k) { return chartsData.dailyIncome[k]; });
  
  var ctxMonthly = document.getElementById("chart-income-monthly").getContext("2d");
  
  var gradient = ctxMonthly.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(109, 40, 217, 0.6)');
  gradient.addColorStop(1, 'rgba(109, 40, 217, 0.0)');

  activeCharts.monthly = new Chart(ctxMonthly, {
    type: 'line',
    data: {
      labels: monthlyLabels,
      datasets: [{
        label: 'Pendapatan (IDR)',
        data: monthlyValues,
        backgroundColor: gradient,
        borderColor: '#6D28D9',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#13141F',
        pointBorderColor: '#6D28D9',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94A3B8' } },
        x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // 2. Member Status Ratio
  var activeNum = Number(document.getElementById("dash-active-members").innerText) || 0;
  var expiredNum = Number(document.getElementById("dash-expired-members").innerText) || 0;
  
  var ctxRatio = document.getElementById("chart-member-ratio").getContext("2d");
  activeCharts.ratio = new Chart(ctxRatio, {
    type: 'doughnut',
    data: {
      labels: ['Aktif', 'Expired'],
      datasets: [{
        data: [activeNum, expiredNum],
        backgroundColor: ['#10B981', '#EF4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8' } } }
    }
  });

  // 3. Transactions Types Pie Chart
  var txLabels = Object.keys(chartsData.txTypes);
  var txValues = txLabels.map(function(k) { return chartsData.txTypes[k]; });
  
  var ctxTx = document.getElementById("chart-tx-types").getContext("2d");
  activeCharts.tx = new Chart(ctxTx, {
    type: 'pie',
    data: {
      labels: txLabels,
      datasets: [{
        data: txValues,
        backgroundColor: [
          '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6',
          '#14B8A6', '#F97316', '#6366F1', '#06B6D4', '#84CC16', '#D946EF',
          '#0EA5E9', '#F43F5E', '#10B981', '#EAB308', '#64748B', '#A855F7',
          '#4ADE80', '#FB923C', '#818CF8', '#C084FC', '#F472B6', '#2DD4BF'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8' } } },
      onClick: function(evt, elements) {
        if (elements && elements.length > 0) {
          var clickedLabel = txLabels[elements[0].index];
          
          // Cari opsi yang sesuai, jika tidak ada tambahkan sementara
          var sel = document.getElementById("dash-filter-type");
          var match = Array.from(sel.options).find(function(opt) { 
            return opt.value === clickedLabel || opt.text === clickedLabel; 
          });
          
          if (match) {
            sel.value = match.value;
          } else {
            sel.value = ""; // fallback
          }
          applyDashboardFilter();
        }
      }
    }
  });

  // 4. Casual Vehicles distribution
  var casualLabels = Object.keys(chartsData.casualVehicles);
  var casualValues = casualLabels.map(function(k) { return chartsData.casualVehicles[k]; });
  
  var ctxCasual = document.getElementById("chart-casual-vehicles").getContext("2d");
  activeCharts.casual = new Chart(ctxCasual, {
    type: 'doughnut',
    data: {
      labels: casualLabels,
      datasets: [{
        data: casualValues,
        backgroundColor: ['#60A5FA', '#FBBF24', '#F87171', '#34D399', '#A78BFA'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8' } } }
    }
  });
}

function populateProductDropdowns() {
  var newSelect = document.getElementById("new-product-code");
  var editSelect = document.getElementById("edit-product-code");
  var filterSelect = document.getElementById("member-filter-product");
  var renewSelect = document.getElementById("renew-product-code");
  
  var optionsHtml = '<option value="">-- Pilih Produk --</option>';
  var filterOptions = '<option value="">Semua Produk</option>';
  
  productsCache.forEach(function(p) {
    optionsHtml += '<option value="' + p.code + '">' + p.code + ' - ' + p.name + '</option>';
    filterOptions += '<option value="' + p.code + '">' + p.code + '</option>';
  });
  
  newSelect.innerHTML = optionsHtml;
  editSelect.innerHTML = optionsHtml;
  filterSelect.innerHTML = filterOptions;
  if(renewSelect) renewSelect.innerHTML = optionsHtml;
}

function calculateClientEndDate(startDateStr, durationStr) {
  if (!startDateStr) return "";
  var parts = startDateStr.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  
  if (durationStr && durationStr.toString().toLowerCase().indexOf("hari") !== -1) {
    var daysToAdd = parseInt(durationStr, 10) || 1;
    var dObj = new Date(year, month, day + daysToAdd);
    var d = dObj.getDate();
    var m = dObj.getMonth() + 1;
    var y = dObj.getFullYear();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }
  
  var monthsToAdd = parseInt(durationStr, 10) || 1;
  var endMonth = (day >= 26) ? month + monthsToAdd + 1 : month + monthsToAdd;
  var endDate = new Date(year, endMonth, 5);
  
  var d2 = endDate.getDate();
  var m2 = endDate.getMonth() + 1;
  var y2 = endDate.getFullYear();
  return y2 + '-' + (m2 < 10 ? '0' + m2 : m2) + '-' + (d2 < 10 ? '0' + d2 : d2);
}

/**
 * D. PRODUCT & TARIF VIEW
 */
function fetchProducts() {
  showLoader("Memuat data tarif...");
  google.script.run
    .withSuccessHandler(function(prods) {
      hideLoader();
      productsCache = prods;
      renderProductsTable();
    })
    .getProducts();
}

function renderProductsTable() {
  var tbody = document.getElementById("table-products-body");
  tbody.innerHTML = "";
  
  productsCache.forEach(function(p) {
    var tr = document.createElement("tr");
    tr.innerHTML = '<td><b>' + p.code + '</b></td>' +
      '<td>' + p.name + '</td>' +
      '<td>Rp ' + p.memberCost.toLocaleString("id-ID") + '</td>' +
      '<td>Rp ' + p.renewalCost.toLocaleString("id-ID") + '</td>' +
      '<td>Rp ' + p.plateChangeCost.toLocaleString("id-ID") + '</td>' +
      '<td>Rp ' + p.newCardCost.toLocaleString("id-ID") + '</td>' +
      '<td>Rp ' + p.lostCardCost.toLocaleString("id-ID") + '</td>' +
      '<td>Rp ' + p.initialCardCost.toLocaleString("id-ID") + '</td>' +
      '<td style="text-align:center;">' +
        '<button class="btn btn-secondary btn-sm" onclick="openProductModal(\'' + p.code + '\')" style="margin-right:6px;"><span class="material-symbols-outlined" style="font-size:14px;">edit</span></button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteProduct(\'' + p.code + '\')"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>' +
      '</td>';
    tbody.appendChild(tr);
  });
}

function openProductModal(code) {
  var modal = document.getElementById("modal-product");
  var title = document.getElementById("product-modal-title");
  var form = document.getElementById("form-product");
  
  form.reset();
  document.getElementById("prod-code").readOnly = false;
  
  if (code) {
    title.innerText = "Edit Master Produk & Tarif";
    document.getElementById("prod-code").readOnly = true;
    
    var p = productsCache.find(function(item) { return item.code === code; });
    if (p) {
      document.getElementById("prod-code").value = p.code;
      document.getElementById("prod-name").value = p.name;
      document.getElementById("prod-member-cost").value = p.memberCost;
      document.getElementById("prod-renewal-cost").value = p.renewalCost;
      document.getElementById("prod-plate-cost").value = p.plateChangeCost;
      document.getElementById("prod-card-new").value = p.newCardCost;
      document.getElementById("prod-card-lost").value = p.lostCardCost;
      document.getElementById("prod-card-initial").value = p.initialCardCost;
    }
  } else {
    title.innerText = "Tambah Produk & Tarif Baru";
  }
  
  modal.classList.add("open");
}

function closeProductModal() {
  document.getElementById("modal-product").classList.remove("open");
}

function handleProductFormSubmit(e) {
  e.preventDefault();
  var prodObj = {
    code: document.getElementById("prod-code").value.trim(),
    name: document.getElementById("prod-name").value.trim(),
    memberCost: Number(document.getElementById("prod-member-cost").value),
    renewalCost: Number(document.getElementById("prod-renewal-cost").value),
    plateChangeCost: Number(document.getElementById("prod-plate-cost").value),
    newCardCost: Number(document.getElementById("prod-card-new").value),
    lostCardCost: Number(document.getElementById("prod-card-lost").value),
    initialCardCost: Number(document.getElementById("prod-card-initial").value),
    periode: Number(document.getElementById("prod-periode").value) || 1
  };
  
  showLoader("Menyimpan data produk...");
  google.script.run
    .withSuccessHandler(function(res) {
      closeProductModal();
      fetchProducts();
    })
    .saveProduct(currentUser.username, prodObj);
}

function deleteProduct(code) {
  if (confirm("Apakah Anda yakin ingin menghapus produk " + code + "?")) {
    showLoader("Menghapus produk...");
    google.script.run
      .withSuccessHandler(function(res) {
        fetchProducts();
      })
      .deleteProduct(currentUser.username, code);
  }
}

/**
 * E. PEMBUATAN MEMBER BARU VIEW
 */
function handleNewMemberProductChange() {
  var prodCode = document.getElementById("new-product-code").value;
  var product = productsCache.find(function(p) { return p.code === prodCode; });
  
  if (product) {
    // Member cost + initial card cost
    var totalCost = product.memberCost + product.initialCardCost;
    document.getElementById("new-nominal").value = totalCost;
  } else {
    document.getElementById("new-nominal").value = "";
  }
  handleNewMemberDateChange(); // Update preview expired date
}

function handleNewMemberDateChange() {
  var startDate = document.getElementById("new-start-date").value;
  var prodCode = document.getElementById("new-product-code").value;
  var product = productsCache.find(function(p) { return p.code === prodCode; });
  var durationStr = product ? product.duration : "1";

  if (startDate) {
    var parts = startDate.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    
    if (durationStr && durationStr.toString().toLowerCase().indexOf("hari") !== -1) {
      var daysToAdd = parseInt(durationStr, 10) || 1;
      var dObj = new Date(year, month, day + daysToAdd);
      var d = dObj.getDate();
      var m = dObj.getMonth() + 1;
      var y = dObj.getFullYear();
      var formattedEnd = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
      document.getElementById("new-end-date").value = formattedEnd;
      return;
    }
    
    var monthsToAdd = parseInt(durationStr, 10) || 1;
    var endMonth = (day >= 26) ? month + monthsToAdd + 1 : month + monthsToAdd;
    var endDate = new Date(year, endMonth, 5);
    
    var d = endDate.getDate();
    var m = endDate.getMonth() + 1;
    var y = endDate.getFullYear();
    var formattedEnd = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
    
    document.getElementById("new-end-date").value = formattedEnd;
  } else {
    document.getElementById("new-end-date").value = "";
  }
}

function handleNewMemberSubmit(e) {
  e.preventDefault();
  var memberObj = {
    passNumber: document.getElementById("new-pass-number").value.trim(),
    name: document.getElementById("new-name").value.trim(),
    plateNumber: document.getElementById("new-plate-number").value.trim(),
    productCode: document.getElementById("new-product-code").value,
    cardNumber: document.getElementById("new-card-number").value.trim(),
    startDate: document.getElementById("new-start-date").value,
    nominalPaid: Number(document.getElementById("new-nominal").value)
  };
  
  showLoader("Mendaftarkan member...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        alert("Pendaftaran Berhasil! Kontrak berakhir pada: " + res.expiryDate);
        document.getElementById("form-new-member").reset();
        navigateTo("member-data");
      } else {
        alert("Gagal: " + res.message);
      }
    })
    .createNewMember(currentUser.username, memberObj);
}

/**
 * F. PERPANJANGAN MEMBER VIEW
 */
function triggerMemberRenewalSearch() {
  var query = document.getElementById("search-renewal-query").value.trim();
  if (!query) return alert("Masukkan Nomor Plat atau Pass");
  
  showLoader("Mencari data member...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      var card = document.getElementById("renewal-details-card");
      if (res.success) {
        card.style.display = "block";
        document.getElementById("renew-pass-number").value = res.passNumber;
        document.getElementById("renew-name").value = res.name;
        document.getElementById("renew-plate-number").value = res.plateNumber;
        document.getElementById("renew-product-code").value = res.productCode;
        document.getElementById("renew-current-end").value = res.endDate;
        document.getElementById("renew-nominal").value = res.renewalCost;
        
        handleRenewProductChange(); // Calculate estimated new end date automatically
      } else {
        card.style.display = "none";
        alert(res.message);
      }
    })
    .searchMemberForRenewal(query);
}

function handleRenewProductChange() {
  var prodCode = document.getElementById("renew-product-code").value;
  var product = productsCache.find(function(p) { return p.code === prodCode; });
  var currentEnd = document.getElementById("renew-current-end").value;
  
  if (product) {
    document.getElementById("renew-nominal").value = product.renewalCost;
    
    // Calculate new estimated end date
    var todayStr = new Date().toISOString().substring(0, 10);
    var baseDate = (currentEnd >= todayStr) ? currentEnd : todayStr;
    
    var newEnd = calculateClientEndDate(baseDate, product.duration);
    document.getElementById("renew-new-end").value = newEnd;
  } else {
    document.getElementById("renew-nominal").value = "";
    document.getElementById("renew-new-end").value = "";
  }
}

function handleRenewalSubmit(e) {
  e.preventDefault();
  var renewalObj = {
    passNumber: document.getElementById("renew-pass-number").value,
    productCode: document.getElementById("renew-product-code").value,
    nominal: Number(document.getElementById("renew-nominal").value),
    keterangan: document.getElementById("renew-keterangan").value.trim()
  };
  
  showLoader("Memperpanjang masa aktif...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        alert("Perpanjangan Berhasil! Masa aktif baru berakhir pada: " + res.expiryDate);
        document.getElementById("renewal-details-card").style.display = "none";
        document.getElementById("search-renewal-query").value = "";
        navigateTo("member-data");
      } else {
        alert("Gagal: " + res.message);
      }
    })
    .processMemberRenewal(currentUser.username, renewalObj);
}

/**
 * G. GANTI PLAT NOMOR VIEW
 */
function triggerPlateSearch() {
  var query = document.getElementById("search-plate-query").value.trim();
  if (!query) return alert("Masukkan Plat Lama atau Pass");
  
  showLoader("Mencari data member...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      var card = document.getElementById("plate-change-card");
      if (res.success) {
        card.style.display = "block";
        document.getElementById("plate-pass-number").value = res.passNumber;
        document.getElementById("plate-member-name").value = res.name;
        document.getElementById("plate-old-number").value = res.plateNumber;
        
        var product = productsCache.find(function(p) { return p.code === res.productCode; });
        document.getElementById("plate-nominal").value = product ? product.plateChangeCost : 0;
      } else {
        card.style.display = "none";
        alert(res.message);
      }
    })
    .searchMemberForRenewal(query);
}

function handlePlateChangeSubmit(e) {
  e.preventDefault();
  var changeObj = {
    passNumber: document.getElementById("plate-pass-number").value,
    newPlate: document.getElementById("plate-new-number").value.trim(),
    nominal: Number(document.getElementById("plate-nominal").value),
    keterangan: document.getElementById("plate-keterangan").value.trim()
  };
  
  showLoader("Memproses pergantian plat...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        alert("Nomor Plat Berhasil Diganti!");
        document.getElementById("plate-change-card").style.display = "none";
        document.getElementById("search-plate-query").value = "";
        navigateTo("member-data");
      } else {
        alert("Gagal: " + res.message);
      }
    })
    .processPlateNumberChange(currentUser.username, changeObj);
}

/**
 * H. GANTI KARTU VIEW
 */
function triggerCardSearch() {
  var query = document.getElementById("search-card-query").value.trim();
  if (!query) return alert("Masukkan Plat atau Pass");
  
  showLoader("Mencari data member...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      var card = document.getElementById("card-change-card");
      if (res.success) {
        card.style.display = "block";
        document.getElementById("card-pass-number").value = res.passNumber;
        document.getElementById("card-member-name").value = res.name;
        document.getElementById("card-old-number").value = res.cardNumber;
        
        var product = productsCache.find(function(p) { return p.code === res.productCode; });
        document.getElementById("card-nominal").value = product ? product.lostCardCost : 0;
      } else {
        card.style.display = "none";
        alert(res.message);
      }
    })
    .searchMemberForRenewal(query);
}

function handleCardChangeSubmit(e) {
  e.preventDefault();
  var changeObj = {
    passNumber: document.getElementById("card-pass-number").value,
    newCardNumber: document.getElementById("card-new-number").value.trim(),
    nominal: Number(document.getElementById("card-nominal").value),
    keterangan: document.getElementById("card-keterangan").value.trim()
  };
  
  showLoader("Memproses penggantian kartu...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        alert("Kartu Berhasil Diganti!");
        document.getElementById("card-change-card").style.display = "none";
        document.getElementById("search-card-query").value = "";
        navigateTo("member-data");
      } else {
        alert("Gagal: " + res.message);
      }
    })
    .processCardChange(currentUser.username, changeObj);
}

/**
 * I. CASUAL TRANSACTION VIEW
 */
function submitCasualTransactions() {
  var inputDate = document.getElementById("casual-input-date").value;
  if (!inputDate) return alert("Pilih Tanggal Input Data terlebih dahulu!");

  var types = ["mobil", "motor", "box", "taxi", "lt"];
  var list = [];
  var hasActive = false;
  
  types.forEach(function(t) {
    var qty = Number(document.getElementById("casual-" + t + "-qty").value) || 0;
    var totalNominal = Number(document.getElementById("casual-" + t + "-total").value) || 0;
    
    if (qty > 0 || totalNominal > 0) {
      hasActive = true;
      var typeName = (t === "lt") ? "LT" : (t.charAt(0).toUpperCase() + t.slice(1));
      list.push({
        type: typeName,
        qty: qty,
        rate1: 0,
        rate2: 0,
        total: totalNominal
      });
    }
  });
  
  if (!hasActive) return alert("Belum ada kendaraan yang diinput.");
  
  showLoader("Menyimpan input casual...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        alert("Data Casual Harian Berhasil Disimpan!");
        // Reset quantities
        types.forEach(function(t) {
          document.getElementById("casual-" + t + "-qty").value = 0;
          document.getElementById("casual-" + t + "-total").value = 0;
        });
        document.getElementById("casual-input-date").value = "";
        navigateTo("dashboard");
      } else {
        alert("Gagal: " + res.message);
      }
    })
    .saveCasualLogs(currentUser.username, inputDate, list);
}

function submitRekapStickerTransactions() {
  var inputDate = document.getElementById("rekap-sticker-date").value;
  if (!inputDate) return alert("Pilih Tanggal Input Data terlebih dahulu!");

  var types = [
    { id: "member-baru", label: "Member Baru" },
    { id: "perpanjangan", label: "Perpanjangan Member" },
    { id: "ganti-plat", label: "Ganti Nomor Plat" },
    { id: "kartu-baru", label: "Beli Kartu Baru" }
  ];
  
  var list = [];
  var hasActive = false;
  
  types.forEach(function(t) {
    var qty = Number(document.getElementById("rekap-" + t.id + "-qty").value) || 0;
    var totalNominal = Number(document.getElementById("rekap-" + t.id + "-total").value) || 0;
    
    if (qty > 0 || totalNominal > 0) {
      hasActive = true;
      list.push({
        type: t.label,
        qty: qty,
        total: totalNominal
      });
    }
  });
  
  if (!hasActive) return alert("Belum ada rekap yang diinput.");
  
  showLoader("Menyimpan rekap pendapatan...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        alert("Rekap Pendapatan Sticker Berhasil Disimpan!");
        // Reset quantities
        types.forEach(function(t) {
          document.getElementById("rekap-" + t.id + "-qty").value = 0;
          document.getElementById("rekap-" + t.id + "-total").value = 0;
        });
        document.getElementById("rekap-sticker-date").value = "";
        navigateTo("dashboard");
      } else {
        alert("Gagal: " + res.message);
      }
    })
    .saveRekapStickerLogs(currentUser.username, inputDate, list);
}

/**
 * J. MEMBERS DATABASE VIEW WITH PAGINATION & FILTER
 */
function fetchMembers() {
  showLoader("Memuat database member...");
  google.script.run
    .withSuccessHandler(function(mems) {
      hideLoader();
      membersCache = mems;
      filteredMembers = mems;
      memberPage = 1;
      renderMembersTable();
    })
    .getAllMembers();
}

function renderMembersTable() {
  var tbody = document.getElementById("table-members-body");
  tbody.innerHTML = "";
  
  var startIndex = (memberPage - 1) * memberPageSize;
  var endIndex = Math.min(startIndex + memberPageSize, filteredMembers.length);
  
  var pageSlice = filteredMembers.slice(startIndex, endIndex);
  
  pageSlice.forEach(function(m) {
    var tr = document.createElement("tr");
    var statusClass = (m.status === "Active") ? "badge-active" : "badge-expired";
    var startText = formatDateString(m.startDate);
    var endText = formatDateString(m.endDate);
    
    tr.innerHTML = '<td><b>' + m.passNumber + '</b></td>' +
      '<td>' + m.name + '</td>' +
      '<td>' + m.plateNumber + '</td>' +
      '<td>' + m.productCode + '</td>' +
      '<td>' + m.cardNumber + '</td>' +
      '<td>' + startText + '</td>' +
      '<td>' + endText + '</td>' +
      '<td>Rp ' + m.nominalPaid.toLocaleString("id-ID") + '</td>' +
      '<td>' + m.adminName + '</td>' +
      '<td><span class="badge ' + statusClass + '">' + m.status + '</span></td>' +
      '<td style="text-align:center;">' +
        '<button class="btn btn-secondary btn-sm" onclick="openMemberEditModal(\'' + m.passNumber + '\')" style="margin-right:6px;"><span class="material-symbols-outlined" style="font-size:14px;">edit</span></button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteMember(\'' + m.passNumber + '\')"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>' +
      '</td>';
    tbody.appendChild(tr);
  });
  
  document.getElementById("member-pagination-info").innerText = 
    "Menampilkan " + (filteredMembers.length > 0 ? startIndex + 1 : 0) + " - " + endIndex + " dari " + filteredMembers.length + " data";
    
  document.getElementById("btn-member-prev").disabled = (memberPage === 1);
  document.getElementById("btn-member-next").disabled = (endIndex >= filteredMembers.length);
  
  enforceRolePermissions();
}

function changeMemberPage(offset) {
  memberPage += offset;
  renderMembersTable();
}

function filterMemberTable() {
  var q = document.getElementById("member-search-box").value.toLowerCase().trim();
  var status = document.getElementById("member-filter-status").value;
  var product = document.getElementById("member-filter-product").value;
  
  filteredMembers = membersCache.filter(function(m) {
    var matchQ = !q || 
      m.passNumber.toLowerCase().indexOf(q) !== -1 ||
      m.name.toLowerCase().indexOf(q) !== -1 ||
      m.plateNumber.toLowerCase().indexOf(q) !== -1 ||
      m.cardNumber.toLowerCase().indexOf(q) !== -1;
      
    var matchStatus = !status || m.status === status;
    var matchProduct = !product || m.productCode === product;
    
    return matchQ && matchStatus && matchProduct;
  });
  
  memberPage = 1;
  renderMembersTable();
}

// Format raw Date string from Google Sheet
function formatDateString(val) {
  if (!val) return "-";
  if (val instanceof Date) {
    var d = val.getDate();
    var m = val.getMonth() + 1;
    var y = val.getFullYear();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }
  return val.toString().substring(0, 10);
}

// Edit Member Modal Controls
function openMemberEditModal(pass) {
  var m = membersCache.find(function(item) { return item.passNumber === pass; });
  if (!m) return;
  
  // Populate Edit product select options
  var select = document.getElementById("edit-product-code");
  select.value = m.productCode;
  
  document.getElementById("edit-orig-pass").value = m.passNumber;
  document.getElementById("edit-pass-number").value = m.passNumber;
  document.getElementById("edit-name").value = m.name;
  document.getElementById("edit-plate-number").value = m.plateNumber;
  document.getElementById("edit-card-number").value = m.cardNumber;
  document.getElementById("edit-nominal").value = m.nominalPaid;
  document.getElementById("edit-start-date").value = formatDateString(m.startDate);
  document.getElementById("edit-end-date").value = formatDateString(m.endDate);
  
  document.getElementById("modal-member-edit").classList.add("open");
}

function closeMemberEditModal() {
  document.getElementById("modal-member-edit").classList.remove("open");
}

function handleMemberEditSubmit(e) {
  e.preventDefault();
  var origPass = document.getElementById("edit-orig-pass").value;
  var updateObj = {
    passNumber: document.getElementById("edit-pass-number").value.trim(),
    name: document.getElementById("edit-name").value.trim(),
    plateNumber: document.getElementById("edit-plate-number").value.trim(),
    productCode: document.getElementById("edit-product-code").value,
    cardNumber: document.getElementById("edit-card-number").value.trim(),
    nominalPaid: Number(document.getElementById("edit-nominal").value),
    startDate: document.getElementById("edit-start-date").value,
    endDate: document.getElementById("edit-end-date").value
  };
  
  showLoader("Menyimpan data member...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        closeMemberEditModal();
        fetchMembers();
      } else {
        alert("Gagal: " + res.message);
      }
    })
    .updateMemberDetails(currentUser.username, origPass, updateObj);
}

function deleteMember(pass) {
  if (confirm("Apakah Anda yakin ingin menghapus member dengan Pass No: " + pass + "?")) {
    showLoader("Menghapus data member...");
    google.script.run
      .withSuccessHandler(function(res) {
        fetchMembers();
      })
      .deleteMember(currentUser.username, pass);
  }
}

/**
 * EXCEL DOWNLOAD FUNCTION
 */
function exportMemberExcel() {
  if (filteredMembers.length === 0) return alert("Tidak ada data untuk diunduh.");
  
  var csvContent = "data:text/csv;charset=utf-8,";
  // Add Headers
  csvContent += "Nomor Pass,Nama Lengkap,Nomor Plat,Produk Kode,Nomor Kartu,Tanggal Mulai,Tanggal Berakhir,Nominal Dibayar,Admin,Status\n";
  
  filteredMembers.forEach(function(m) {
    var row = [
      m.passNumber,
      m.name,
      m.plateNumber,
      m.productCode,
      m.cardNumber,
      formatDateString(m.startDate),
      formatDateString(m.endDate),
      m.nominalPaid,
      m.adminName,
      m.status
    ].map(function(val) {
      return '"' + val.toString().replace(/"/g, '""') + '"';
    }).join(",");
    csvContent += row + "\n";
  });
  
  var encodedUri = encodeURI(csvContent);
  var link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Parking_Members_Export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * CSV IMPORTER PARSER
 */
function openImportModal() {
  document.getElementById("modal-import").classList.add("open");
  document.getElementById("csv-file-input").value = "";
  document.getElementById("csv-preview").style.display = "none";
}

function closeImportModal() {
  document.getElementById("modal-import").classList.remove("open");
}

function processCSVImport() {
  var fileInput = document.getElementById("csv-file-input");
  if (fileInput.files.length === 0) return alert("Pilih file CSV terlebih dahulu.");
  
  var file = fileInput.files[0];
  var reader = new FileReader();
  
  showLoader("Membaca file CSV...");
  
  reader.onload = function(e) {
    var text = e.target.result;
    var lines = text.split(/\r\n|\n/);
    if (lines.length <= 1) {
      hideLoader();
      return alert("File CSV kosong atau tidak memiliki data.");
    }
    
    // Parse Headers
    var headers = lines[0].split(",");
    var rows = [];
    
    for (var i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var cols = lines[i].split(",");
      if (cols.length < headers.length) continue;
      
      rows.push({
        passNumber: cols[0] ? cols[0].replace(/"/g, '').trim() : "",
        name: cols[1] ? cols[1].replace(/"/g, '').trim() : "",
        plateNumber: cols[2] ? cols[2].replace(/"/g, '').trim() : "",
        productCode: cols[3] ? cols[3].replace(/"/g, '').trim() : "",
        cardNumber: cols[4] ? cols[4].replace(/"/g, '').trim() : "",
        startDate: cols[5] ? cols[5].replace(/"/g, '').trim() : "",
        endDate: cols[6] ? cols[6].replace(/"/g, '').trim() : "",
        nominalPaid: cols[7] ? Number(cols[7].replace(/"/g, '').trim()) : 0
      });
    }
    
    showLoader("Mengunggah " + rows.length + " data member ke server...");
    
    google.script.run
      .withSuccessHandler(function(res) {
        hideLoader();
        closeImportModal();
        if (res.success) {
          alert("Import Selesai!\nBerhasil: " + res.imported + "\nDilewati (Duplikat): " + res.skipped);
          fetchMembers();
        } else {
          alert("Gagal mengimpor: " + res.message);
        }
      })
      .importMembersCSV(currentUser.username, rows);
  };
  
  reader.readAsText(file);
}

/**
 * K. HISTORY LOGS VIEW WITH PAGINATION
 */
function fetchHistory() {
  showLoader("Memuat data history transaksi...");
  google.script.run
    .withSuccessHandler(function(logs) {
      hideLoader();
      historyCache = logs || [];
      filteredHistory = logs || [];
      historyPage = 1;
      renderHistoryTable();
    })
    .getTransactionHistory();
}

var auditCache = [];
var filteredAudit = [];
var auditPage = 1;
var auditPageSize = 100;

function fetchAuditLog() {
  showLoader("Memuat audit log aktivitas...");
  google.script.run
    .withSuccessHandler(function(logs) {
      hideLoader();
      auditCache = logs || [];
      filteredAudit = logs || [];
      auditPage = 1;
      renderAuditTable();
    })
    .getAuditLog();
}

function renderHistoryTable() {
  var tbody = document.getElementById("table-history-body");
  tbody.innerHTML = "";
  
  var startIndex = (historyPage - 1) * historyPageSize;
  var endIndex = Math.min(startIndex + historyPageSize, filteredHistory.length);
  
  var pageSlice = filteredHistory.slice(startIndex, endIndex);
  
  pageSlice.forEach(function(h) {
    var tr = document.createElement("tr");
    var dtText = h.datetime ? h.datetime.toString() : "-";
    
    // Create a safe string for the print parameter
    var hString = encodeURIComponent(JSON.stringify(h));
    
    tr.innerHTML = '<td style="text-align: center;"><input type="checkbox" class="history-checkbox" value="' + hString + '"></td>' +
      '<td><span style="font-size: 11px; font-family: monospace; color: var(--text-secondary);">' + h.txId + '</span></td>' +
      '<td>' + dtText + '</td>' +
      '<td><b>' + h.type + '</b></td>' +
      '<td>' + h.key + '</td>' +
      '<td>' + h.details + '</td>' +
      '<td>' + (h.nominal > 0 ? "Rp " + h.nominal.toLocaleString("id-ID") : "-") + '</td>' +
      '<td>' + h.admin + '</td>' +
      '<td style="text-align: center;"><button class="btn btn-secondary btn-sm" onclick="printSingleInvoice(\'' + hString + '\')"><span class="material-symbols-outlined" style="font-size: 16px;">print</span></button></td>';
    tbody.appendChild(tr);
  });
  
  // Uncheck select all if re-rendered
  var selectAllBox = document.getElementById("history-select-all");
  if(selectAllBox) selectAllBox.checked = false;
  
  document.getElementById("history-pagination-info").innerText = 
    "Menampilkan " + (filteredHistory.length > 0 ? startIndex + 1 : 0) + " - " + endIndex + " dari " + filteredHistory.length + " data";
    
  document.getElementById("btn-history-prev").disabled = (historyPage === 1);
  document.getElementById("btn-history-next").disabled = (endIndex >= filteredHistory.length);
}

function changeHistoryPage(offset) {
  historyPage += offset;
  renderHistoryTable();
}

function filterHistoryTable() {
  var q = document.getElementById("history-search-box").value.toLowerCase().trim();
  
  filteredHistory = historyCache.filter(function(h) {
    return !q || 
      h.txId.toLowerCase().indexOf(q) !== -1 ||
      h.type.toLowerCase().indexOf(q) !== -1 ||
      h.key.toLowerCase().indexOf(q) !== -1 ||
      h.details.toLowerCase().indexOf(q) !== -1 ||
      h.admin.toLowerCase().indexOf(q) !== -1;
  });
  
  historyPage = 1;
  renderHistoryTable();
}

function renderAuditTable() {
  var tbody = document.getElementById("table-audit-body");
  tbody.innerHTML = "";
  
  var startIndex = (auditPage - 1) * auditPageSize;
  var endIndex = Math.min(startIndex + auditPageSize, filteredAudit.length);
  
  var pageSlice = filteredAudit.slice(startIndex, endIndex);
  
  pageSlice.forEach(function(h) {
    var tr = document.createElement("tr");
    var dtText = h.datetime ? h.datetime.toString() : "-";
    
    tr.innerHTML = '<td>' + dtText + '</td>' +
      '<td><b>' + h.type + '</b></td>' +
      '<td>' + h.key + '</td>' +
      '<td>' + h.details + '</td>' +
      '<td>' + h.admin + '</td>';
    tbody.appendChild(tr);
  });
  
  document.getElementById("audit-pagination-info").innerText = 
    "Menampilkan " + (filteredAudit.length > 0 ? startIndex + 1 : 0) + " - " + endIndex + " dari " + filteredAudit.length + " data";
    
  document.getElementById("btn-audit-prev").disabled = (auditPage === 1);
  document.getElementById("btn-audit-next").disabled = (endIndex >= filteredAudit.length);
}

function changeAuditPage(offset) {
  auditPage += offset;
  renderAuditTable();
}

function filterAuditTable() {
  var q = document.getElementById("auditlog-search-box").value.toLowerCase().trim();
  
  filteredAudit = auditCache.filter(function(h) {
    return !q || 
      h.type.toLowerCase().indexOf(q) !== -1 ||
      h.key.toLowerCase().indexOf(q) !== -1 ||
      h.details.toLowerCase().indexOf(q) !== -1 ||
      h.admin.toLowerCase().indexOf(q) !== -1;
  });
  
  auditPage = 1;
  renderAuditTable();
}

function toggleAllHistoryCheckbox(source) {
  var checkboxes = document.querySelectorAll(".history-checkbox");
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = source.checked;
  }
}

function printSingleInvoice(hString) {
  try {
    var tx = JSON.parse(decodeURIComponent(hString));
    executePrint([tx], "ID Transaksi: " + tx.txId);
  } catch(e) {
    alert("Gagal memproses data cetak.");
  }
}

function printCombinedInvoice() {
  var checkboxes = document.querySelectorAll(".history-checkbox:checked");
  if (checkboxes.length === 0) return alert("Silakan centang minimal satu transaksi untuk dicetak gabungan.");
  
  var selectedTxs = [];
  for (var i = 0; i < checkboxes.length; i++) {
    try {
      selectedTxs.push(JSON.parse(decodeURIComponent(checkboxes[i].value)));
    } catch(e) {}
  }
  executePrint(selectedTxs, "Gabungan (" + selectedTxs.length + " Transaksi)");
}

function executePrint(transactions, refText) {
  if (!transactions || transactions.length === 0) return;
  
  // Fill Header Data
  document.getElementById("inv-number").innerText = transactions.length === 1 ? transactions[0].txId : "INV-MULTI-" + Date.now().toString().slice(-6);
  var dt = new Date();
  document.getElementById("inv-date").innerText = dt.toLocaleDateString('id-ID') + " " + dt.toLocaleTimeString('id-ID');
  document.getElementById("inv-admin").innerText = currentUser ? currentUser.username : "System";
  
  // Set Customer Ref (e.g., if all are same key/member, show it. Otherwise show "Gabungan")
  var isSameCustomer = transactions.every(function(tx) { return tx.key === transactions[0].key; });
  document.getElementById("inv-customer").innerText = isSameCustomer ? transactions[0].key : "Beragam Pelanggan";
  document.getElementById("inv-ref").innerText = refText;
  
  // Build Items
  var tbody = document.getElementById("inv-items-body");
  tbody.innerHTML = "";
  var total = 0;
  
  for (var i = 0; i < transactions.length; i++) {
    var tx = transactions[i];
    var tr = document.createElement("tr");
    tr.className = "item " + (i === transactions.length - 1 ? "last" : "");
    tr.innerHTML = '<td><b>' + tx.type + '</b><br><span style="font-size:12px; color:#666;">' + (tx.details || "-") + '</span></td>' +
                   '<td style="text-align: right;">Rp ' + (tx.nominal > 0 ? tx.nominal.toLocaleString("id-ID") : "0") + '</td>';
    tbody.appendChild(tr);
    total += Number(tx.nominal) || 0;
  }
  
  // Set Total
  document.getElementById("inv-total").innerText = "Rp " + total.toLocaleString("id-ID");
  
  // Trigger Print (The @media print CSS will handle showing only the invoice)
  window.print();
}

/**
 * L. LAPORAN DOCUMENT WRITER AND PREVIEW
 */
function handleLaporanPeriodChange() {
  var p = document.getElementById("laporan-period").value;
  var customDates = document.querySelectorAll(".custom-date-group");
  
  if (p === "custom") {
    customDates.forEach(function(el) { el.style.display = "flex"; });
  } else {
    customDates.forEach(function(el) { el.style.display = "none"; });
  }
}

var currentLaporanData = []; // Cache current queried reports

function generateReportsPreview() {
  var filters = {
    reportType: document.getElementById("laporan-type").value,
    period: document.getElementById("laporan-period").value,
    startDate: document.getElementById("laporan-start-date").value,
    endDate: document.getElementById("laporan-end-date").value
  };
  
  if (filters.period === "custom" && (!filters.startDate || !filters.endDate)) {
    return alert("Silakan tentukan Rentang Tanggal Mulai dan Akhir.");
  }
  
  showLoader("Mengambil laporan...");
  google.script.run
    .withSuccessHandler(function(data) {
      hideLoader();
      currentLaporanData = data;
      renderLaporanPreview(filters.reportType, data);
    })
    .getFilteredReports(filters);
}

function renderLaporanPreview(type, data) {
  var previewSection = document.getElementById("laporan-preview-section");
  var headersRow = document.getElementById("laporan-table-headers");
  var tbody = document.getElementById("laporan-table-body");
  var totalsDiv = document.getElementById("laporan-totals-row");
  
  tbody.innerHTML = "";
  totalsDiv.innerText = "";
  previewSection.style.display = "block";
  
  if (data.length === 0) {
    headersRow.innerHTML = "<th>Informasi</th>";
    tbody.innerHTML = "<tr><td style='text-align:center;'>Tidak ada data ditemukan untuk periode filter yang dipilih.</td></tr>";
    return;
  }
  
  var headers = [];
  var keys = [];
  var isMember = (type.indexOf("member") !== -1 || type === "active" || type === "expired");
  var isCasual = (type === "casual");
  
  if (isMember) {
    headers = ["No Pass", "Nama Member", "Plat Nomor", "Produk", "No Kartu", "Tgl Mulai", "Tgl Expired", "Nominal"];
    keys = ["passNumber", "name", "plateNumber", "productCode", "cardNumber", "startDate", "endDate", "nominal"];
  } else if (isCasual) {
    headers = ["Tanggal", "Jenis Kendaraan", "Qty", "Tarif Jam1", "Tarif Jam2", "Total Nominal"];
    keys = ["date", "type", "qty", "rate1", "rate2", "nominal"];
  } else if (type === "sticker") {
    headers = ["Tanggal", "Jenis Transaksi", "Qty", "Total Nominal", "Admin"];
    keys = ["date", "type", "qty", "nominal", "admin"];
  } else {
    headers = ["ID TX", "Tanggal", "Tipe Transaksi", "Identitas", "Keterangan Detail", "Nominal", "Admin"];
    keys = ["txId", "date", "type", "key", "details", "nominal", "admin"];
  }
  
  // Render Headers
  headersRow.innerHTML = headers.map(function(h) { return '<th>' + h + '</th>'; }).join("");
  
  // Render Rows
  var totalSum = 0;
  data.forEach(function(row) {
    var tr = document.createElement("tr");
    var colsHtml = "";
    
    keys.forEach(function(k) {
      var val = row[k];
      if (k === "nominal") {
        totalSum += Number(val) || 0;
        colsHtml += '<td><b>Rp ' + Number(val).toLocaleString("id-ID") + '</b></td>';
      } else if (val instanceof Date) {
        colsHtml += '<td>' + formatDateString(val) + '</td>';
      } else {
        colsHtml += '<td>' + (val ? val.toString() : "-") + '</td>';
      }
    });
    
    tr.innerHTML = colsHtml;
    tbody.appendChild(tr);
  });
  
  totalsDiv.innerText = "TOTAL VOLUME PENDAPATAN LAPORAN: Rp " + totalSum.toLocaleString("id-ID");
}

function exportPDFReport() {
  if (currentLaporanData.length === 0) return alert("Silakan filter dan tampilkan laporan terlebih dahulu.");
  
  var filters = {
    reportType: document.getElementById("laporan-type").value,
    period: document.getElementById("laporan-period").value,
    startDate: document.getElementById("laporan-start-date").value,
    endDate: document.getElementById("laporan-end-date").value
  };
  
  showLoader("Membuat & menyimpan PDF laporan ke Google Drive...");
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoader();
      if (res.success) {
        alert("Laporan berhasil disimpan!\nNama File: " + res.name);
        window.open(res.viewUrl, "_blank");
      } else {
        alert("Gagal mengekspor PDF: " + res.message);
      }
    })
    .generatePDFReport(currentUser.username, filters, currentLaporanData);
}

function printLaporanDiv() {
  var printContents = document.getElementById("print-area").innerHTML;
  var title = document.getElementById("laporan-type").options[document.getElementById("laporan-type").selectedIndex].text.toUpperCase();
  var period = document.getElementById("laporan-period").options[document.getElementById("laporan-period").selectedIndex].text.toUpperCase();
  
  var logoSrc = "";
  try {
    logoSrc = document.getElementById("invoice-logo-img").src;
  } catch(e){}

  var printWindow = window.open('', '', 'height=800,width=1000');
  
  var html = '<!DOCTYPE html><html><head><title>Print Report - Inter Parking</title>';
  html += '<' + 'style>';
  html += 'body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }';
  
  // Page styling
  html += '@page { size: A4 portrait; margin: 15mm 15mm 25mm 15mm; }';
  
  // Header styling
  html += '.report-header { text-align: left; margin-bottom: 20px; }';
  html += '.report-logo { max-height: 60px; }';
  
  // Title styling
  html += 'h2 { text-align: center; color: #333; margin: 10px 0 5px 0; font-size: 20px; font-weight: bold; }';
  html += '.report-subtitle { text-align: center; color: #666; margin-bottom: 30px; font-size: 14px; font-weight: bold; }';
  
  // Table styling
  html += 'table { width: 100%; border-collapse: collapse; margin-bottom: 50px; font-size: 11px; }';
  html += 'th, td { border: 1px solid #ddd; padding: 8px 6px; text-align: left; }';
  html += 'th { background-color: #f4f6f8 !important; font-weight: bold; color: #333; }';
  html += 'tr:nth-child(even) { background-color: #fafafa !important; }';
  html += 'tr.total-row td { background-color: #e9ecef !important; font-weight: bold; }';
  
  // Footer styling (Fixed at bottom for every page)
  html += '.report-footer { position: fixed; bottom: 0; left: 0; width: 100%; text-align: center; font-size: 9px; color: #555; background: #fff; }';
  html += '.footer-content { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 20px 10px 20px; }';
  html += '.footer-left, .footer-right { width: 25%; font-weight: bold; color: #4a86e8; }';
  html += '.footer-center { width: 50%; text-align: center; line-height: 1.5; color: #666; }';
  html += '.footer-bottom-bar { height: 12px; background-color: #f6b26b !important; width: 100%; }'; // Orange bar
  
  html += '</' + 'style></head><body>';
  
  // Header
  html += '<div class="report-header">';
  html += '  <img class="report-logo" src="' + logoSrc + '" alt="Inter Parking">';
  html += '</div>';
  
  // Title
  html += '<h2>REKAPITULASI LAPORAN INTER PARKING</h2>';
  html += '<div class="report-subtitle">TIPE: ' + title + ' | PERIODE: ' + period + '</div>';
  
  // Table Data
  html += printContents;
  
  // Footer
  html += '<div class="report-footer">';
  html += '  <div class="footer-content">';
  html += '    <div class="footer-left" style="text-align:left;">+62 21 2928 2073</div>';
  html += '    <div class="footer-center">Grand Slipi Tower<br>Jl. S. Parman Kav. 22-24, Slipi, Jakarta Barat<br>DKI Jakarta, Indonesia 11480</div>';
  html += '    <div class="footer-right" style="text-align:right;">interparking.com</div>';
  html += '  </div>';
  html += '  <div class="footer-bottom-bar"></div>';
  html += '</div>';
  
  html += '</body></' + 'html>';
  
  printWindow.document.write(html);
  printWindow.document.close();
  
  // Wait for the logo image to load before triggering print
  setTimeout(function() {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, 500);
}

/**
 * M. USER MANAGEMENT VIEW (Super Admin Only)
 */
var usersCache = [];
function fetchUsers() {
  showLoader("Memuat data users...");
  google.script.run
    .withSuccessHandler(function(users) {
      hideLoader();
      usersCache = users;
      renderUsersTable(users);
    })
    .getUsers(currentUser.username);
}

function renderUsersTable(users) {
  var tbody = document.getElementById("table-users-body");
  tbody.innerHTML = "";
  
  users.forEach(function(u) {
    var tr = document.createElement("tr");
    var statusClass = (u.status === "Active") ? "badge-active" : "badge-neutral";
    
    tr.innerHTML = '<td><b>' + u.username + '</b></td>' +
      '<td>' + u.role + '</td>' +
      '<td><span class="badge ' + statusClass + '">' + u.status + '</span></td>' +
      '<td>' + u.createdBy + '</td>' +
      '<td style="text-align:center;">' +
        '<button class="btn btn-secondary btn-sm" onclick="openUserModal(\'' + u.username + '\')" style="margin-right:6px;"><span class="material-symbols-outlined" style="font-size:14px;">edit</span></button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + u.username + '\')"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>' +
      '</td>';
    tbody.appendChild(tr);
  });
}

function openUserModal(username) {
  var modal = document.getElementById("modal-user");
  var title = document.getElementById("user-modal-title");
  var form = document.getElementById("form-user");
  
  form.reset();
  document.getElementById("user-username").readOnly = false;
  document.getElementById("user-password").required = true;
  
  if (username && typeof username === "string") {
    title.innerText = "Edit User Akses";
    document.getElementById("user-username").value = username;
    document.getElementById("user-username").readOnly = true;
    document.getElementById("user-password").required = false; 
    
    var u = usersCache.find(function(user) { return user.username === username; });
    if (u) {
      document.getElementById("user-role").value = u.role;
      document.getElementById("user-status").value = u.status;
      
      var allowed = u.allowedMenus;
      if (!allowed || allowed === "ALL") {
        selectAllMenus(true);
      } else {
        selectAllMenus(false);
        var allowedList = allowed.split(",");
        document.querySelectorAll(".menu-checkbox").forEach(function(cb) {
          if (allowedList.indexOf(cb.value) !== -1) cb.checked = true;
        });
      }
    }
  } else {
    title.innerText = "Tambah User Baru";
    document.getElementById("user-username").value = "";
    selectAllMenus(true);
  }
  
  modal.classList.add("open");
}

function closeUserModal() {
  document.getElementById("modal-user").classList.remove("open");
}

function selectAllMenus(selectAll) {
  document.querySelectorAll(".menu-checkbox").forEach(function(cb) {
    cb.checked = selectAll;
  });
}

function handleUserSubmit(e) {
  e.preventDefault();
  
  var checkedMenus = [];
  document.querySelectorAll(".menu-checkbox:checked").forEach(function(cb) {
    checkedMenus.push(cb.value);
  });
  var allowedStr = checkedMenus.length > 0 ? checkedMenus.join(",") : "ALL";

  var userObj = {
    username: document.getElementById("user-username").value.trim(),
    password: document.getElementById("user-password").value,
    role: document.getElementById("user-role").value,
    status: document.getElementById("user-status").value,
    allowedMenus: allowedStr
  };
  
  showLoader("Menyimpan akun user...");
  try {
    google.script.run
      .withSuccessHandler(function(res) {
        hideLoader();
        closeUserModal();
        fetchUsers();
        alert("Sukses! User berhasil disimpan.");
      })
      .withFailureHandler(function(err) {
        hideLoader();
        alert("GAGAL MENYIMPAN: " + err.message);
      })
      .saveUser(currentUser.username, userObj);
  } catch (error) {
    hideLoader();
    alert("CRITICAL ERROR: " + error.message);
  }
}

function deleteUser(username) {
  if (confirm("Apakah Anda yakin ingin menghapus akun user " + username + "?")) {
    showLoader("Menghapus akun user...");
    google.script.run
      .withSuccessHandler(function(res) {
        fetchUsers();
      })
      .withFailureHandler(function(err) {
        hideLoader();
        alert("Gagal menghapus: " + err.message);
      })
      .deleteUser(currentUser.username, username);
  }
}

function toggleLoginPassword() {
  var input = document.getElementById('login-password');
  var icon = document.querySelector('.toggle-password');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerText = 'visibility_off';
  } else {
    input.type = 'password';
    icon.innerText = 'visibility';
  }
}


