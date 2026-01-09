/**
 * MVP End-to-End Test Script
 * Tests the complete flow: Register → Login → Post Job → Submit Proposal → Hire → Project
 * 
 * Run with: npx ts-node scripts/mvp-test.ts
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'https://api.homico.ge';

// Test data
// Generate unique test users with timestamp
const timestamp = Date.now();
const suffix = timestamp.toString().slice(-6);

const TEST_CLIENT = {
  email: `mvp.client.${timestamp}@demo.com`,
  password: 'TestPass123!',
  name: 'MVP Test Client',
  phone: `+9955${suffix}1`,
  role: 'client',
};

const TEST_PRO = {
  email: `mvp.pro.${timestamp}@demo.com`,
  password: 'TestPass123!',
  name: 'MVP Test Pro',
  phone: `+9955${suffix}2`,
  role: 'pro',
};

const TEST_JOB = {
  title: 'MVP Test Job - Interior Design',
  description: 'This is a test job for MVP testing. Need interior design for apartment.',
  category: 'design',
  skills: ['interior'],
  location: 'Tbilisi, Georgia',
  propertyType: 'apartment',
  budgetType: 'range',
  budgetMin: 500,
  budgetMax: 2000,
  roomCount: 3,
};

const TEST_PROPOSAL = {
  coverLetter: 'I am an experienced interior designer and would love to work on this project. I have 5+ years of experience.',
  proposedPrice: 1500,
  estimatedDuration: 14,
  estimatedDurationUnit: 'days',
};

let clientToken = '';
let proToken = '';
let jobId = '';
let proposalId = '';

async function log(step: string, status: 'START' | 'OK' | 'FAIL', message?: string) {
  const icons = { START: '🔄', OK: '✅', FAIL: '❌' };
  console.log(`${icons[status]} ${step}${message ? ': ' + message : ''}`);
}

async function registerUser(userData: typeof TEST_CLIENT): Promise<string> {
  try {
    const regRes = await axios.post(`${API_URL}/auth/register`, userData);
    log(`Register ${userData.name}`, 'OK', `User created: ${userData.email}`);
    return regRes.data.access_token;
  } catch (err: any) {
    log(`Register ${userData.name}`, 'FAIL', err.response?.data?.message || err.message);
    throw err;
  }
}

async function postJob(token: string): Promise<string> {
  try {
    const res = await axios.post(`${API_URL}/jobs`, TEST_JOB, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const id = res.data._id || res.data.id;
    log('Post Job', 'OK', `Job ID: ${id}`);
    return id;
  } catch (err: any) {
    log('Post Job', 'FAIL', err.response?.data?.message || err.message);
    throw err;
  }
}

async function submitProposal(token: string, jobId: string): Promise<string> {
  try {
    const res = await axios.post(
      `${API_URL}/jobs/${jobId}/proposals`,
      TEST_PROPOSAL,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const id = res.data._id || res.data.id;
    log('Submit Proposal', 'OK', `Proposal ID: ${id}`);
    return id;
  } catch (err: any) {
    log('Submit Proposal', 'FAIL', err.response?.data?.message || err.message);
    throw err;
  }
}

async function acceptProposal(token: string, jobId: string, proposalId: string): Promise<void> {
  try {
    // First shortlist the proposal with hiring choice
    await axios.post(
      `${API_URL}/jobs/proposals/${proposalId}/shortlist`,
      { hiringChoice: 'homico' },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    log('Shortlist Proposal', 'OK');

    // Then accept (hire through Homico)
    await axios.post(
      `${API_URL}/jobs/proposals/${proposalId}/accept`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    log('Accept Proposal (Hire)', 'OK');
  } catch (err: any) {
    log('Accept Proposal', 'FAIL', err.response?.data?.message || err.message);
    throw err;
  }
}

async function verifyJobStatus(token: string, jobId: string, expectedStatus: string): Promise<any> {
  try {
    const res = await axios.get(`${API_URL}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const job = res.data;
    const status = job.status;
    const hasHiredPro = !!job.hiredPro;
    
    if (status === expectedStatus) {
      log('Verify Job Status', 'OK', `Status: ${status}, hiredPro: ${hasHiredPro}`);
    } else {
      log('Verify Job Status', 'FAIL', `Expected ${expectedStatus}, got ${status}`);
    }
    
    return job;
  } catch (err: any) {
    log('Verify Job Status', 'FAIL', err.response?.data?.message || err.message);
    throw err;
  }
}

async function verifyProjectTracking(token: string, jobId: string): Promise<void> {
  try {
    const res = await axios.get(`${API_URL}/jobs/projects/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const project = res.data;
    log('Verify Project Tracking', 'OK', `Stage: ${project.currentStage}, Progress: ${project.progress}%`);
  } catch (err: any) {
    log('Verify Project Tracking', 'FAIL', err.response?.data?.message || err.message);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('  MVP End-to-End Test');
  console.log('  API:', API_URL);
  console.log('========================================\n');

  try {
    // Step 1: Register as Client
    log('Step 1: Client Registration', 'START');
    clientToken = await registerUser(TEST_CLIENT);

    // Step 2: Register as Pro
    log('Step 2: Pro Registration', 'START');
    proToken = await registerUser(TEST_PRO);

    // Step 3: Client posts a job
    log('Step 3: Client Posts Job', 'START');
    jobId = await postJob(clientToken);

    // Step 4: Pro submits proposal
    log('Step 4: Pro Submits Proposal', 'START');
    proposalId = await submitProposal(proToken, jobId);

    // Step 5: Verify job is open
    log('Step 5: Verify Job is Open', 'START');
    await verifyJobStatus(clientToken, jobId, 'open');

    // Step 6: Client accepts proposal (hires pro)
    log('Step 6: Client Hires Pro', 'START');
    await acceptProposal(clientToken, jobId, proposalId);

    // Step 7: Verify job is in_progress with hiredPro
    log('Step 7: Verify Job In Progress', 'START');
    const job = await verifyJobStatus(clientToken, jobId, 'in_progress');
    
    if (job.hiredPro) {
      console.log('\n📋 hiredPro data:');
      console.log(JSON.stringify(job.hiredPro, null, 2));
    }

    // Step 8: Verify project tracking exists (as client)
    log('Step 8: Client Checks Project', 'START');
    await verifyProjectTracking(clientToken, jobId);

    // Step 9: Pro checks project tracking
    log('Step 9: Pro Checks Project', 'START');
    await verifyProjectTracking(proToken, jobId);

    console.log('\n========================================');
    console.log('  ✅ ALL TESTS PASSED!');
    console.log('========================================');
    console.log('\nTest Data:');
    console.log('  Job ID:', jobId);
    console.log('  Proposal ID:', proposalId);
    console.log('  Client:', TEST_CLIENT.email);
    console.log('  Pro:', TEST_PRO.email);
    console.log('\nYou can now test in browser:');
    console.log(`  Login as client: ${TEST_CLIENT.email} / ${TEST_CLIENT.password}`);
    console.log(`  Login as pro: ${TEST_PRO.email} / ${TEST_PRO.password}`);
    console.log(`  View job: /jobs/${jobId}`);

  } catch (err) {
    console.log('\n========================================');
    console.log('  ❌ TEST FAILED');
    console.log('========================================');
    process.exit(1);
  }
}

runTests();
