// ════════════════════════════════════════════════
//  SUPABASE CONFIG
// ════════════════════════════════════════════════
const SUPABASE_URL = 'https://vvbwmkmcjiaovbdlubof.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2Yndta21jamlhb3ZiZGx1Ym9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NTMzMTQsImV4cCI6MjA4NDAyOTMxNH0.91RbKIrjQOU2GTJT_t9L74gWYoRp3pt1TngvUvevlHE';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
let allUsers = [];
let pendingDeposits = [];
let pendingWithdrawals = [];
let allInvestments = [];
let allTransactions = [];
let currentDeposit = null;
let currentWithdrawal = null;
let currentBalanceUser = null;

// ════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => loadAllData());

async function loadAllData() {
    showLoading();
    try {
        await Promise.all([
            loadUsers(),
            loadPendingDeposits(),
            loadPendingWithdrawals(),
            loadAllInvestments(),
            loadAllTransactions()
        ]);
        renderDashboard();
        syncMobileBadges();
    } catch (err) {
        toast('Error loading data: ' + err.message, 'error');
    }
    hideLoading();
}

// ════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════
const pageTitles = {
    dashboard:   ['Dashboard', 'Platform overview & statistics'],
    users:       ['All Users', 'Registered accounts management'],
    deposits:    ['Pending Deposits', 'Investment approvals'],
    withdrawals: ['Pending Withdrawals', 'Withdrawal processing'],
    investments: ['All Investments', 'Complete investment records'],
    transactions:['All Transactions', 'Full transaction history']
};

function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById('page-' + name).classList.add('active');
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    const mobilePageMap = { dashboard: 0, users: 1, deposits: 2, withdrawals: 3, transactions: 4 };
    if (mobilePageMap[name] !== undefined) {
        mobileNavItems[mobilePageMap[name]]?.classList.add('active');
    }

    const [title, sub] = pageTitles[name];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = sub;

    // Close sidebar on mobile
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const btn = document.getElementById('hamburgerBtn');
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        btn.classList.remove('open');
    }
}

// ════════════════════════════════════════════════
//  LOAD DATA WITH ERROR HANDLING FOR BALANCE COLUMN
// ════════════════════════════════════════════════
async function loadUsers() {
    try {
        // First try to select all columns including balance
        const { data, error } = await db
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            // If error is about missing balance column, try without it
            if (error.message && error.message.includes('balance')) {
                console.log('Balance column not found, loading without balance');
                const { data: fallbackData, error: fallbackError } = await db
                    .from('profiles')
                    .select('id, full_name, email, phone, country, status, email_verified, created_at, crypto_wallet_address, date_of_birth, address')
                    .order('created_at', { ascending: false });
                
                if (fallbackError) throw fallbackError;
                
                // Add balance property with default 0
                allUsers = (fallbackData || []).map(user => ({
                    ...user,
                    balance: 0
                }));
            } else {
                throw error;
            }
        } else {
            allUsers = data || [];
            // Ensure balance exists
            allUsers = allUsers.map(user => ({
                ...user,
                balance: user.balance || 0
            }));
        }
        
        document.getElementById('usersCount').textContent = allUsers.length;
        renderAllUsers();
    } catch (err) {
        console.error('Error loading users:', err);
        toast('Error loading users: ' + err.message, 'error');
        allUsers = [];
    }
}

async function loadPendingDeposits() {
    try {
        const { data, error } = await db
            .from('investments')
            .select('*, user:profiles!investments_user_id_fkey(full_name, email), plan:investment_plans(name, weekly_return, duration_weeks)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        pendingDeposits = data || [];
        document.getElementById('depositsCount').textContent = pendingDeposits.length;
        document.getElementById('dep-count-label').textContent = pendingDeposits.length + ' pending';
        renderPendingDeposits();
    } catch (err) {
        console.error('Error loading deposits:', err);
        toast('Error loading deposits: ' + err.message, 'error');
        pendingDeposits = [];
    }
}

async function loadPendingWithdrawals() {
    try {
        const { data, error } = await db
            .from('transactions')
            .select('*, user:profiles!transactions_user_id_fkey(full_name, email, crypto_wallet_address)')
            .eq('type', 'withdrawal')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        pendingWithdrawals = data || [];
        document.getElementById('withdrawalsCount').textContent = pendingWithdrawals.length;
        document.getElementById('with-count-label').textContent = pendingWithdrawals.length + ' pending';
        renderPendingWithdrawals();
    } catch (err) {
        console.error('Error loading withdrawals:', err);
        toast('Error loading withdrawals: ' + err.message, 'error');
        pendingWithdrawals = [];
    }
}

async function loadAllInvestments() {
    try {
        const { data, error } = await db
            .from('investments')
            .select('*, user:profiles!investments_user_id_fkey(full_name, email), plan:investment_plans(name)')
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        allInvestments = data || [];
        renderAllInvestments();
    } catch (err) {
        console.error('Error loading investments:', err);
        toast('Error loading investments: ' + err.message, 'error');
        allInvestments = [];
    }
}

async function loadAllTransactions() {
    try {
        const { data, error } = await db
            .from('transactions')
            .select('*, user:profiles!transactions_user_id_fkey(full_name, email)')
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        allTransactions = data || [];
        renderAllTransactions();
    } catch (err) {
        console.error('Error loading transactions:', err);
        toast('Error loading transactions: ' + err.message, 'error');
        allTransactions = [];
    }
}

// ════════════════════════════════════════════════
//  IMPROVED DEPOSIT FUNCTIONS
// ════════════════════════════════════════════════

async function reviewDeposit(depositId) {
    showLoading();
    try {
        const { data: dep, error } = await db
            .from('investments')
            .select('*, user:profiles!investments_user_id_fkey(full_name, email, crypto_wallet_address, balance), plan:investment_plans(name, weekly_return, duration_weeks)')
            .eq('id', depositId).single();
        
        if (error) throw error;
        currentDeposit = dep;

        // Calculate returns
        const weekly = parseFloat(dep.amount) * (parseFloat(dep.plan?.weekly_return || 0) / 100);
        const totalReturn = weekly * parseInt(dep.plan?.duration_weeks || 0);
        const finalAmt = parseFloat(dep.amount) + totalReturn;

        // Get user balance
        let userBalance = 0;
        try {
            const { data: userData } = await db
                .from('profiles')
                .select('balance')
                .eq('id', dep.user_id)
                .single();
            userBalance = parseFloat(userData?.balance || 0);
        } catch (e) {
            console.log('Balance column not available');
        }

        document.getElementById('depositModalBody').innerHTML = `
            <div class="detail-grid">
                <div class="detail-row">
                    <div class="detail-label">User</div>
                    <div class="detail-value">
                        <strong>${esc(dep.user?.full_name)}</strong>
                        <div class="td-sub">${esc(dep.user?.email)}</div>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Current Balance</div>
                    <div class="detail-value" style="color:var(--gold); font-size:18px;">${fmt(userBalance)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Plan</div>
                    <div class="detail-value"><strong>${esc(dep.plan?.name)}</strong></div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Investment Amount</div>
                    <div class="detail-value"><strong style="font-size:20px; color:var(--gold)">${fmt(dep.amount)}</strong></div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Weekly Return</div>
                    <div class="detail-value">${dep.plan?.weekly_return}% (${fmt(weekly)}/week)</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Duration</div>
                    <div class="detail-value">${dep.plan?.duration_weeks} weeks</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Total Return</div>
                    <div class="detail-value" style="color:var(--success)">${fmt(totalReturn)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Final Amount</div>
                    <div class="detail-value" style="color:var(--success); font-size:18px;">${fmt(finalAmt)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Submitted</div>
                    <div class="detail-value td-mono">${fmtDateTime(dep.created_at)}</div>
                </div>
                ${dep.transaction_hash ? `
                    <div class="detail-row">
                        <div class="detail-label">TX Hash</div>
                        <div class="detail-value td-mono">${esc(dep.transaction_hash)}</div>
                    </div>
                ` : ''}
            </div>
            
            ${dep.proof_of_payment ? `
                <div style="margin:20px 0;">
                    <div style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--text3); margin-bottom:8px;">
                        Proof of Payment
                    </div>
                    <img src="${dep.proof_of_payment}" class="proof-img" alt="Payment Proof" style="max-width:100%; border-radius:8px; border:1px solid var(--border2);">
                </div>
            ` : ''}
            
            <div class="alert alert-success" style="margin-top:16px;">
                <strong>📊 Investment Summary:</strong><br>
                • Amount: ${fmt(dep.amount)}<br>
                • Weekly Return: ${fmt(weekly)} (${dep.plan?.weekly_return}%)<br>
                • Duration: ${dep.plan?.duration_weeks} weeks<br>
                • Total Return: ${fmt(totalReturn)}<br>
                • Final Payout: ${fmt(finalAmt)}
            </div>
            
            <div class="alert alert-warning">
                ⚠️ Upon approval:
                <ul style="margin-top:8px; margin-left:20px;">
                    <li>The investment amount will be added to user's balance</li>
                    <li>The investment will become active immediately</li>
                    <li>Returns will start accruing from today</li>
                    <li>User will receive a notification</li>
                </ul>
            </div>
        `;

        document.getElementById('depositModalFooter').innerHTML = `
            <button class="btn btn-outline" onclick="closeModal('depositModal')">Cancel</button>
            <button class="btn btn-danger" onclick="rejectDeposit('${depositId}')">
                ✗ Reject Deposit
            </button>
            <button class="btn btn-success" onclick="approveDeposit('${depositId}')">
                ✓ Approve & Activate Investment
            </button>
        `;

        hideLoading();
        openModal('depositModal');
        
    } catch (err) {
        hideLoading();
        console.error('Review deposit error:', err);
        toast('Error loading deposit details: ' + err.message, 'error');
    }
}

async function approveDeposit(depositId) {
    if (!confirm('Approve this deposit? This will add funds to user balance and activate the investment.')) {
        return;
    }
    
    showLoading();
    
    try {
        const dep = currentDeposit;
        if (!dep) {
            throw new Error('Deposit data not found');
        }

        // Calculate dates
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (dep.plan.duration_weeks * 7));
        
        // Calculate returns
        const weeklyReturn = parseFloat(dep.amount) * (parseFloat(dep.plan.weekly_return) / 100);
        const totalReturn = weeklyReturn * parseInt(dep.plan.duration_weeks);

        // 1. Update investment status to active
        const { error: invError } = await db
            .from('investments')
            .update({
                status: 'active',
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                total_return: totalReturn,
                updated_at: new Date().toISOString()
            })
            .eq('id', depositId);

        if (invError) {
            console.error('Investment update error:', invError);
            throw new Error('Failed to activate investment: ' + invError.message);
        }

        // 2. Get current user balance
        const { data: userData, error: userError } = await db
            .from('profiles')
            .select('balance')
            .eq('id', dep.user_id)
            .single();

        if (userError) {
            console.error('Error fetching user balance:', userError);
            throw new Error('Failed to fetch user balance');
        }

        const currentBalance = parseFloat(userData?.balance || 0);
        const newBalance = currentBalance + parseFloat(dep.amount);

        // 3. Update user balance (add deposit amount)
        const { error: balanceError } = await db
            .from('profiles')
            .update({
                balance: newBalance,
                updated_at: new Date().toISOString()
            })
            .eq('id', dep.user_id);

        if (balanceError) {
            console.error('Balance update error:', balanceError);
            throw new Error('Failed to update user balance');
        }

        // 4. Update the associated transaction
        const { error: txError } = await db
            .from('transactions')
            .update({
                status: 'approved',
                processed_at: new Date().toISOString(),
                description: `Investment approved - ${dep.plan?.name} plan`
            })
            .eq('investment_id', depositId);

        if (txError) {
            console.warn('Failed to update transaction status:', txError);
        }

        // 5. Create a notification for the user (if notifications table exists)
        try {
            await db
                .from('notifications')
                .insert({
                    user_id: dep.user_id,
                    title: 'Investment Approved! 🎉',
                    message: `Your investment of ${fmt(dep.amount)} in the ${dep.plan?.name} plan has been approved and is now active.`,
                    type: 'success',
                    read: false,
                    created_at: new Date().toISOString()
                });
        } catch (notifError) {
            console.warn('Failed to create notification:', notifError);
        }

        // Close modal and show success message
        closeModal('depositModal');
        toast('✅ Investment approved successfully! Funds added to user balance.', 'success');
        
        // Log the approval for audit
        console.log('Deposit approved:', {
            investment_id: depositId,
            user_id: dep.user_id,
            amount: dep.amount,
            plan: dep.plan?.name,
            new_balance: newBalance,
            approved_at: new Date().toISOString()
        });

        // Reload all data to refresh the UI
        await Promise.all([
            loadUsers(),
            loadPendingDeposits(),
            loadPendingWithdrawals(),
            loadAllInvestments(),
            loadAllTransactions()
        ]);
        
        renderDashboard();
        syncMobileBadges();
        
        hideLoading();

    } catch (err) {
        hideLoading();
        console.error('Approve deposit error:', err);
        toast('Error: ' + err.message, 'error');
    }
}

async function rejectDeposit(depositId) {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    
    showLoading();
    
    try {
        const dep = currentDeposit;
        
        // 1. Update investment status to rejected
        const { error: invError } = await db
            .from('investments')
            .update({
                status: 'rejected',
                admin_notes: reason,
                updated_at: new Date().toISOString()
            })
            .eq('id', depositId);

        if (invError) throw invError;

        // 2. Update the associated transaction
        const { error: txError } = await db
            .from('transactions')
            .update({
                status: 'rejected',
                admin_notes: reason,
                processed_at: new Date().toISOString()
            })
            .eq('investment_id', depositId);

        if (txError) {
            console.warn('Failed to update transaction status:', txError);
        }

        // 3. Create rejection notification for user (if notifications table exists)
        try {
            await db
                .from('notifications')
                .insert({
                    user_id: dep.user_id,
                    title: 'Investment Rejected',
                    message: `Your investment of ${fmt(dep.amount)} was rejected. Reason: ${reason}`,
                    type: 'error',
                    read: false,
                    created_at: new Date().toISOString()
                });
        } catch (notifError) {
            console.warn('Failed to create notification:', notifError);
        }

        closeModal('depositModal');
        toast('Deposit rejected', 'info');
        
        // Log rejection
        console.log('Deposit rejected:', {
            investment_id: depositId,
            user_id: dep.user_id,
            amount: dep.amount,
            reason: reason,
            rejected_at: new Date().toISOString()
        });

        // Reload data
        await Promise.all([
            loadPendingDeposits(),
            loadAllInvestments(),
            loadAllTransactions()
        ]);
        
        syncMobileBadges();
        hideLoading();
        
    } catch (err) {
        hideLoading();
        console.error('Reject deposit error:', err);
        toast('Error: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════
//  RENDER FUNCTIONS
// ════════════════════════════════════════════════
function renderDashboard() {
    const totalInvested = allInvestments
        .filter(i => i.status === 'active' || i.status === 'completed')
        .reduce((s, i) => s + parseFloat(i.amount || 0), 0);

    document.getElementById('stat-users').textContent = allUsers.length;
    document.getElementById('stat-invested').textContent = fmt(totalInvested);
    document.getElementById('stat-pending-dep').textContent = pendingDeposits.length;
    document.getElementById('stat-pending-with').textContent = pendingWithdrawals.length;

    const recentUsers = allUsers.slice(0, 5);
    document.getElementById('recent-users-count').textContent = 'Showing ' + recentUsers.length + ' of ' + allUsers.length;
    document.getElementById('recentUsersTable').innerHTML = recentUsers.length
        ? buildUserTable(recentUsers)
        : emptyState('No users yet');

    const recentTx = allTransactions.slice(0, 10);
    document.getElementById('recentTxTable').innerHTML = recentTx.length
        ? buildTxTable(recentTx)
        : emptyState('No transactions yet');
}

function renderAllUsers(list) {
    const users = list || allUsers;
    document.getElementById('allUsersTable').innerHTML = users.length
        ? buildUserTable(users)
        : emptyState('No users found');
}

function buildUserTable(users) {
    return `<table>
        <thead><tr>
            <th>User</th><th>Phone</th><th>Country</th>
            <th>Status</th><th>Balance</th><th>Verified</th><th>Action</th>
        </tr></thead>
        <tbody>${users.map(u => `
            <tr>
                <td>
                    <strong>${esc(u.full_name || '—')}</strong>
                    <div class="td-sub">${esc(u.email || '—')}</div>
                </td>
                <td class="td-mono">${esc(u.phone || '—')}</td>
                <td>${esc(u.country || '—')}</td>
                <td>${statusBadge(u.status || 'active')}</td>
                <td><strong style="color:${u.hasOwnProperty('balance') ? 'var(--gold)' : 'var(--text3)'}">${fmt(u.balance || 0)}</strong></td>
                <td>${u.email_verified ? '<span style="color:var(--success)">✓</span>' : '<span style="color:var(--danger)">✗</span>'}</td>
                <td><button class="btn btn-outline" onclick="viewUser('${u.id}')">Manage</button></td>
            </tr>
        `).join('')}</tbody>
    </table>`;
}

function filterUsers(query) {
    const q = query.toLowerCase();
    const filtered = allUsers.filter(u =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
    renderAllUsers(filtered);
}

function renderPendingDeposits() {
    const el = document.getElementById('pendingDepositsTable');
    if (!pendingDeposits.length) { 
        el.innerHTML = emptyState('No pending deposits'); 
        return; 
    }
    el.innerHTML = `<table>
        <thead><tr>
            <th>User</th><th>Plan</th><th>Amount</th><th>Submitted</th><th>Proof</th><th>Action</th>
        </tr></thead>
        <tbody>${pendingDeposits.map(d => `
            <tr>
                <td>
                    <strong>${esc(d.user?.full_name || '—')}</strong>
                    <div class="td-sub">${esc(d.user?.email || '—')}</div>
                </td>
                <td><strong>${esc(d.plan?.name || '—')}</strong></td>
                <td><strong style="color:var(--gold)">${fmt(d.amount)}</strong></td>
                <td class="td-mono">${fmtDateTime(d.created_at)}</td>
                <td>${d.proof_of_payment
                    ? `<a href="${d.proof_of_payment}" target="_blank" class="btn btn-outline">View ↗</a>`
                    : '<span style="color:var(--text3)">None</span>'
                }</td>
                <td><button class="btn btn-gold" onclick="reviewDeposit('${d.id}')">Review</button></td>
            </tr>
        `).join('')}</tbody>
    </table>`;
}

function renderPendingWithdrawals() {
    const el = document.getElementById('pendingWithdrawalsTable');
    if (!pendingWithdrawals.length) { 
        el.innerHTML = emptyState('No pending withdrawals'); 
        return; 
    }
    el.innerHTML = `<table>
        <thead><tr>
            <th>User</th><th>Amount</th><th>Wallet</th><th>Balance</th><th>Requested</th><th>Action</th>
        </tr></thead>
        <tbody>${pendingWithdrawals.map(w => {
            // Try to get user balance
            const user = allUsers.find(u => u.id === w.user_id);
            const userBalance = user?.balance || 0;
            
            return `
            <tr>
                <td>
                    <strong>${esc(w.user?.full_name || '—')}</strong>
                    <div class="td-sub">${esc(w.user?.email || '—')}</div>
                </td>
                <td><strong style="color:var(--gold)">${fmt(w.amount)}</strong></td>
                <td><div class="td-mono" style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${esc(w.user?.crypto_wallet_address || w.crypto_wallet || '—')}</div></td>
                <td><strong style="color:${userBalance >= w.amount ? 'var(--success)' : 'var(--danger)'}">${fmt(userBalance)}</strong></td>
                <td class="td-mono">${fmtDateTime(w.created_at)}</td>
                <td><button class="btn btn-gold" onclick="reviewWithdrawal('${w.id}')">Process</button></td>
            </tr>
        `}).join('')}</tbody>
    </table>`;
}

async function reviewWithdrawal(withdrawalId) {
    showLoading();
    try {
        const { data: w, error } = await db
            .from('transactions')
            .select('*, user:profiles!transactions_user_id_fkey(full_name, email, crypto_wallet_address)')
            .eq('id', withdrawalId).single();
        if (error) throw error;
        currentWithdrawal = w;
        
        // Get user balance
        let userBalance = 0;
        try {
            const { data: userData } = await db
                .from('profiles')
                .select('balance')
                .eq('id', w.user_id)
                .single();
            userBalance = parseFloat(userData?.balance || 0);
        } catch (e) {
            console.log('Balance column not available');
        }
        
        const wallet = w.user?.crypto_wallet_address || w.crypto_wallet || '—';
        const hasBalance = userBalance >= w.amount;

        document.getElementById('withdrawalModalBody').innerHTML = `
            <div class="detail-grid">
                <div class="detail-row"><div class="detail-label">User</div><div class="detail-value">${esc(w.user?.full_name)} <span class="td-sub">${esc(w.user?.email)}</span></div></div>
                <div class="detail-row"><div class="detail-label">Amount</div><div class="detail-value"><strong style="font-size:22px;color:var(--gold)">${fmt(w.amount)}</strong></div></div>
                <div class="detail-row"><div class="detail-label">Current Balance</div><div class="detail-value" style="color:${hasBalance ? 'var(--success)' : 'var(--danger)'}">${fmt(userBalance)}</div></div>
                <div class="detail-row"><div class="detail-label">Requested</div><div class="detail-value td-mono">${fmtDateTime(w.created_at)}</div></div>
            </div>
            ${!hasBalance ? `
                <div class="alert alert-danger">
                    ⚠️ Insufficient balance! User has ${fmt(userBalance)} but requested ${fmt(w.amount)}.
                </div>
            ` : ''}
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:8px;font-family:'JetBrains Mono',monospace">Send Crypto To This Address</div>
            <div class="wallet-box">${esc(wallet)}</div>
            <button class="btn btn-outline" style="width:100%;margin-bottom:16px" onclick="copyText('${esc(wallet)}')">📋 Copy Address</button>
            <div class="alert alert-warning">⚠️ Send the exact amount manually, then click "Mark as Sent" to deduct from balance.</div>
        `;

        document.getElementById('withdrawalModalFooter').innerHTML = `
            <button class="btn btn-outline" onclick="closeModal('withdrawalModal')">Cancel</button>
            <button class="btn btn-danger" onclick="rejectWithdrawal('${withdrawalId}')">✗ Reject</button>
            ${hasBalance ? `<button class="btn btn-success" onclick="approveWithdrawal('${withdrawalId}')">✓ Mark as Sent</button>` : ''}
        `;

        hideLoading();
        openModal('withdrawalModal');
    } catch (err) {
        hideLoading();
        toast('Error: ' + err.message, 'error');
    }
}

async function approveWithdrawal(withdrawalId) {
    const txHash = prompt('Enter blockchain transaction hash (optional):') || '';
    showLoading();
    try {
        const w = currentWithdrawal;
        
        // Deduct from user balance
        try {
            const { data: user, error: userError } = await db
                .from('profiles')
                .select('balance')
                .eq('id', w.user_id)
                .single();
                
            if (!userError) {
                const newBalance = parseFloat(user.balance || 0) - parseFloat(w.amount);
                if (newBalance < 0) throw new Error('Insufficient balance');
                
                await db
                    .from('profiles')
                    .update({ 
                        balance: newBalance,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', w.user_id);
            }
        } catch (e) {
            console.log('Balance column not available, skipping balance deduction');
        }

        await db.from('transactions').update({
            status: 'approved',
            transaction_hash: txHash,
            processed_at: new Date().toISOString()
        }).eq('id', withdrawalId);

        closeModal('withdrawalModal');
        toast('✓ Withdrawal approved!', 'success');
        
        await Promise.all([
            loadUsers(),
            loadPendingWithdrawals(),
            loadAllTransactions()
        ]);
        renderDashboard();
        syncMobileBadges();
        hideLoading();
    } catch (err) {
        hideLoading();
        toast('Error: ' + err.message, 'error');
    }
}

async function rejectWithdrawal(withdrawalId) {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    showLoading();
    try {
        await db.from('transactions').update({
            status: 'rejected',
            admin_notes: reason,
            processed_at: new Date().toISOString()
        }).eq('id', withdrawalId);

        closeModal('withdrawalModal');
        toast('Withdrawal rejected', 'info');
        
        await loadPendingWithdrawals();
        syncMobileBadges();
        hideLoading();
    } catch (err) {
        hideLoading();
        toast('Error: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════
//  BALANCE MANAGEMENT FUNCTIONS
// ════════════════════════════════════════════════
async function openBalanceModal(userId, action) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    currentBalanceUser = user;
    const title = action === 'add' ? '💰 Add Balance' : '💸 Remove Balance';
    const btnClass = action === 'add' ? 'btn-success' : 'btn-danger';
    const btnText = action === 'add' ? '✓ Add Balance' : '✗ Remove Balance';
    
    document.getElementById('balanceTxTitle').textContent = title;
    document.getElementById('balanceTxModalBody').innerHTML = `
        <div class="detail-grid">
            <div class="detail-row">
                <div class="detail-label">User</div>
                <div class="detail-value">${esc(user.full_name || '—')} (${esc(user.email)})</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Current Balance</div>
                <div class="detail-value" style="color:var(--gold); font-size:18px;">${fmt(user.balance || 0)}</div>
            </div>
        </div>
        
        <div class="balance-control">
            <div class="balance-header">
                <span class="balance-label">${action === 'add' ? 'ADD AMOUNT' : 'REMOVE AMOUNT'}</span>
            </div>
            
            <div class="balance-input-group">
                <input type="number" id="balanceAmount" class="balance-input" placeholder="Enter amount (USD)" min="0.01" step="0.01">
            </div>
            
            <div class="alert alert-warning">
                ⚠️ This will create a transaction record and update the user's balance immediately.
            </div>
            
            <div style="margin-top:16px;">
                <label style="color:var(--text2); font-size:12px; display:block; margin-bottom:6px;">Description (optional)</label>
                <input type="text" id="balanceDescription" class="balance-input" placeholder="e.g., Bonus, Adjustment, Refund...">
            </div>
        </div>
    `;
    
    document.getElementById('balanceTxModalFooter').innerHTML = `
        <button class="btn btn-outline" onclick="closeModal('balanceTxModal')">Cancel</button>
        <button class="btn ${btnClass}" onclick="processBalanceAdjustment('${userId}', '${action}')">${btnText}</button>
    `;
    
    openModal('balanceTxModal');
}

async function processBalanceAdjustment(userId, action) {
    const amount = parseFloat(document.getElementById('balanceAmount')?.value);
    if (!amount || amount <= 0) {
        toast('Please enter a valid amount', 'error');
        return;
    }
    
    const description = document.getElementById('balanceDescription')?.value || 
        (action === 'add' ? 'Admin balance addition' : 'Admin balance removal');
    
    if (!confirm(`${action === 'add' ? 'Add' : 'Remove'} $${amount.toFixed(2)} ${action === 'add' ? 'to' : 'from'} this user's balance?`)) return;
    
    showLoading();
    try {
        // First check if balance column exists by trying to select it
        let currentBalance = 0;
        let columnExists = true;
        
        try {
            const { data: user, error: fetchError } = await db
                .from('profiles')
                .select('balance')
                .eq('id', userId)
                .single();
            
            if (fetchError) {
                if (fetchError.message && fetchError.message.includes('balance')) {
                    columnExists = false;
                    throw new Error('Balance column does not exist. Please add it first.');
                } else {
                    throw fetchError;
                }
            }
            
            currentBalance = parseFloat(user?.balance || 0);
        } catch (err) {
            if (err.message.includes('Balance column does not exist')) {
                hideLoading();
                
                // Show option to add column
                if (confirm('Balance column does not exist. Would you like to add it now?')) {
                    await addBalanceColumn();
                }
                return;
            }
            throw err;
        }
        
        const newBalance = action === 'add' 
            ? currentBalance + amount 
            : currentBalance - amount;
            
        if (newBalance < 0) {
            toast('Insufficient balance for removal', 'error');
            hideLoading();
            return;
        }
        
        // Update user balance
        const { error: updateError } = await db
            .from('profiles')
            .update({ 
                balance: newBalance,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
            
        if (updateError) throw updateError;
        
        // Create transaction record
        const { error: txError } = await db
            .from('transactions')
            .insert({
                user_id: userId,
                type: action === 'add' ? 'deposit' : 'withdrawal',
                amount: amount,
                status: 'approved',
                description: description,
                admin_id: 'admin',
                processed_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            });
            
        if (txError) throw txError;
        
        closeModal('balanceTxModal');
        toast(`Balance ${action === 'add' ? 'added' : 'removed'} successfully!`, 'success');
        
        // Reload data and refresh user view
        await loadUsers();
        if (document.getElementById('userModal').classList.contains('open')) {
            await viewUser(userId);
        }
        
        renderDashboard();
        syncMobileBadges();
        hideLoading();
        
    } catch (err) {
        hideLoading();
        toast('Error: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════
//  USER VIEW FUNCTION
// ════════════════════════════════════════════════
async function viewUser(userId) {
    showLoading();
    try {
        const user = allUsers.find(u => u.id === userId);
        if (!user) throw new Error('User not found');
        
        const { data: investments } = await db
            .from('investments')
            .select('*, plan:investment_plans(name)')
            .eq('user_id', userId);
            
        const { data: transactions } = await db
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        const totalInvested = (investments || []).reduce((s, i) => s + parseFloat(i.amount || 0), 0);
        const active = (investments || []).filter(i => i.status === 'active').length;

        // Build balance controls HTML
        const balanceControls = `
            <div class="balance-control">
                <div class="balance-header">
                    <span class="balance-label">Current Balance</span>
                    <span class="balance-amount">${fmt(user.balance || 0)}</span>
                </div>
                <div class="balance-actions">
                    <button class="btn btn-success" onclick="openBalanceModal('${userId}', 'add')">➕ Add Balance</button>
                    <button class="btn btn-warning" onclick="openBalanceModal('${userId}', 'remove')">➖ Remove Balance</button>
                </div>
                <div style="margin-top:10px; text-align:center;">
                    <small class="td-mono">Balance column status: ${user.hasOwnProperty('balance') ? '✅ Available' : '⚠️ Not available'}</small>
                </div>
            </div>
        `;

        // User details content
        const userDetails = `
            <div class="detail-grid">
                <div class="detail-row"><div class="detail-label">Full Name</div><div class="detail-value">${esc(user.full_name)}</div></div>
                <div class="detail-row"><div class="detail-label">Email</div><div class="detail-value">${esc(user.email)}</div></div>
                <div class="detail-row"><div class="detail-label">Phone</div><div class="detail-value">${esc(user.phone || '—')}</div></div>
                <div class="detail-row"><div class="detail-label">Country</div><div class="detail-value">${esc(user.country || '—')}</div></div>
                <div class="detail-row"><div class="detail-label">Date of Birth</div><div class="detail-value">${esc(user.date_of_birth || '—')}</div></div>
                <div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">${esc(user.address || '—')}</div></div>
                <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">${statusBadge(user.status || 'active')}</div></div>
                <div class="detail-row"><div class="detail-label">Email Verified</div><div class="detail-value">${user.email_verified ? '<span style="color:var(--success)">✓ Verified</span>' : '<span style="color:var(--danger)">✗ Not Verified</span>'}</div></div>
            </div>
            <div class="detail-row" style="margin-bottom:20px">
                <div class="detail-label">Wallet Address</div>
                <div class="detail-value td-mono">${esc(user.crypto_wallet_address || 'Not provided')}</div>
            </div>
            <div class="returns-grid" style="margin-bottom:20px">
                <div class="return-card"><div class="return-label">Total Invested</div><div class="return-value">${fmt(totalInvested)}</div></div>
                <div class="return-card"><div class="return-label">Active Plans</div><div class="return-value" style="color:var(--success)">${active}</div></div>
                <div class="return-card"><div class="return-label">Total Plans</div><div class="return-value" style="color:var(--text)">${(investments || []).length}</div></div>
            </div>
            ${(transactions || []).length > 0 ? `
                <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:10px;font-family:'JetBrains Mono',monospace">Recent Transactions</div>
                ${buildTxTable(transactions || [])}
            ` : ''}
        `;

        document.getElementById('userBalanceControls').innerHTML = balanceControls;
        document.getElementById('userDetailsContent').innerHTML = userDetails;

        document.getElementById('userModalFooter').innerHTML = `
            <button class="btn btn-outline" onclick="closeModal('userModal')">Close</button>
            <button class="btn ${user.status === 'blocked' ? 'btn-success' : 'btn-danger'}" onclick="toggleBlock('${userId}', ${user.status === 'blocked'})">
                ${user.status === 'blocked' ? '✓ Unblock User' : '⊘ Block User'}
            </button>
        `;

        hideLoading();
        openModal('userModal');
    } catch (err) {
        hideLoading();
        toast('Error: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════
//  RENDER FUNCTIONS (continued)
// ════════════════════════════════════════════════
function renderAllInvestments() {
    const el = document.getElementById('allInvestmentsTable');
    if (!allInvestments.length) { 
        el.innerHTML = emptyState('No investments found'); 
        return; 
    }
    el.innerHTML = `<table>
        <thead><tr>
            <th>User</th><th>Plan</th><th>Amount</th><th>Status</th>
            <th>Start</th><th>End</th><th>Returns</th>
        </tr></thead>
        <tbody>${allInvestments.map(i => `
            <tr>
                <td>
                    <strong>${esc(i.user?.full_name || '—')}</strong>
                    <div class="td-sub">${esc(i.user?.email || '—')}</div>
                </td>
                <td><strong>${esc(i.plan?.name || '—')}</strong></td>
                <td><strong style="color:var(--gold)">${fmt(i.amount)}</strong></td>
                <td>${statusBadge(i.status)}</td>
                <td class="td-mono">${i.start_date ? fmtDate(i.start_date) : '—'}</td>
                <td class="td-mono">${i.end_date ? fmtDate(i.end_date) : '—'}</td>
                <td><strong style="color:var(--success)">${fmt(i.total_return || 0)}</strong></td>
            </tr>
        `).join('')}</tbody>
    </table>`;
}

function renderAllTransactions() {
    const el = document.getElementById('allTransactionsTable');
    if (!allTransactions.length) { 
        el.innerHTML = emptyState('No transactions found'); 
        return; 
    }
    el.innerHTML = buildTxTable(allTransactions);
}

function buildTxTable(txs) {
    return `<table>
        <thead><tr>
            <th>User</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th><th>Description</th>
        </tr></thead>
        <tbody>${txs.map(tx => `
            <tr>
                <td>
                    <strong>${esc(tx.user?.full_name || '—')}</strong>
                    <div class="td-sub">${esc(tx.user?.email || '—')}</div>
                </td>
                <td>${typeBadge(tx.type)}</td>
                <td><strong style="color:var(--gold)">${fmt(tx.amount)}</strong></td>
                <td>${statusBadge(tx.status)}</td>
                <td class="td-mono">${fmtDateTime(tx.created_at)}</td>
                <td class="td-mono">${esc(tx.description || tx.transaction_hash?.substring(0,16) || '—')}</td>
            </tr>
        `).join('')}</tbody>
    </table>`;
}

// ════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════
function fmt(val) {
    const n = parseFloat(val || 0);
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emptyState(msg) {
    return `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">${msg}</div></div>`;
}

function statusBadge(status) {
    const map = {
        active: 'badge-active', 
        pending: 'badge-pending', 
        rejected: 'badge-rejected',
        approved: 'badge-approved', 
        blocked: 'badge-blocked', 
        completed: 'badge-completed'
    };
    return `<span class="badge ${map[status] || 'badge-pending'}">${status || 'unknown'}</span>`;
}

function typeBadge(type) {
    const map = { 
        deposit: 'badge-deposit', 
        withdrawal: 'badge-withdrawal', 
        profit: 'badge-profit' 
    };
    return `<span class="badge ${map[type] || 'badge-pending'}">${type || '—'}</span>`;
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('Address copied!', 'success'));
}

async function toggleBlock(userId, isCurrentlyBlocked) {
    const action = isCurrentlyBlocked ? 'unblock' : 'block';
    if (!confirm(action.charAt(0).toUpperCase() + action.slice(1) + ' this user?')) return;
    showLoading();
    try {
        await db.from('profiles').update({ status: isCurrentlyBlocked ? 'active' : 'blocked' }).eq('id', userId);
        hideLoading();
        closeModal('userModal');
        toast('User ' + action + 'ed successfully', 'success');
        await loadUsers();
    } catch (err) {
        hideLoading();
        toast('Error: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════
//  MODAL CONTROLS
// ════════════════════════════════════════════════
function openModal(id) { 
    document.getElementById(id).classList.add('open'); 
}

function closeModal(id) { 
    document.getElementById(id).classList.remove('open'); 
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
    });
});

function showLoading() { 
    document.getElementById('loadingOverlay').classList.add('show'); 
}

function hideLoading() { 
    document.getElementById('loadingOverlay').classList.remove('show'); 
}

function toast(msg, type = 'info') {
    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const btn = document.getElementById('hamburgerBtn');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
    btn.classList.toggle('open');
}

function showPageMobile(name, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');

    const [title, sub] = pageTitles[name];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = sub;

    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const btn = document.getElementById('hamburgerBtn');
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    btn.classList.remove('open');
}

function syncMobileBadges() {
    document.getElementById('mn-users').textContent = allUsers.length;
    document.getElementById('mn-deposits').textContent = pendingDeposits.length;
    document.getElementById('mn-withdrawals').textContent = pendingWithdrawals.length;
}

// ════════════════════════════════════════════════
//  DATABASE SETUP FUNCTIONS
// ════════════════════════════════════════════════

// Function to add balance column
async function addBalanceColumn() {
    if (!confirm('This will add a balance column to the profiles table. Continue?')) return;
    
    showLoading();
    try {
        // Execute SQL via Supabase's REST API (requires admin access)
        const { error } = await db.rpc('add_balance_column');
        
        if (error) {
            // If RPC doesn't exist, show manual instructions
            toast('Please add balance column manually using SQL:', 'info');
            console.log(`
                -- Run this SQL in your Supabase SQL editor:
                ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2) DEFAULT 0;
                
                -- Also add these columns for better tracking
                ALTER TABLE investments ADD COLUMN IF NOT EXISTS total_return DECIMAL(10,2) DEFAULT 0;
                ALTER TABLE investments ADD COLUMN IF NOT EXISTS admin_notes TEXT;
                ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
                ALTER TABLE transactions ADD COLUMN IF NOT EXISTS admin_notes TEXT;
                
                -- Create notifications table (optional but recommended)
                CREATE TABLE IF NOT EXISTS notifications (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    type TEXT DEFAULT 'info',
                    read BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `);
        } else {
            toast('Balance column added successfully!', 'success');
        }
        
        // Reload users
        await loadUsers();
    } catch (err) {
        console.error('Error adding column:', err);
        toast('Error: ' + err.message, 'error');
    }
    hideLoading();
}

// Function to ensure database schema is correct
async function ensureDatabaseSchema() {
    try {
        // Check if balance column exists
        const { error } = await db
            .from('profiles')
            .select('balance')
            .limit(1);
        
        if (error && error.message.includes('balance')) {
            console.log('Balance column missing');
            return false;
        }
        return true;
    } catch (err) {
        console.error('Error checking schema:', err);
        return false;
    }
}

// Initialize and check database on load
window.addEventListener('load', async () => {
    setTimeout(async () => {
        const hasBalanceColumn = await ensureDatabaseSchema();
        if (!hasBalanceColumn && allUsers.length > 0) {
            toast('Balance column not found. Click here to add it.', 'info');
            // Make toast clickable
            const toastEl = document.querySelector('.toast:last-child');
            if (toastEl) {
                toastEl.style.cursor = 'pointer';
                toastEl.addEventListener('click', addBalanceColumn);
            }
        }
    }, 3000);
});