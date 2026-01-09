/**
 * Script to fix jobs that are in_progress but don't have accepted proposals
 * Run with: npx ts-node scripts/fix-hired-jobs.ts
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/homico';

async function fixHiredJobs() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!\n');

  const db = mongoose.connection.db;
  const jobsCollection = db.collection('jobs');
  const proposalsCollection = db.collection('proposals');

  // Find all jobs with status 'in_progress'
  const inProgressJobs = await jobsCollection.find({ status: 'in_progress' }).toArray();
  console.log(`Found ${inProgressJobs.length} jobs with status 'in_progress'\n`);

  for (const job of inProgressJobs) {
    console.log(`\n--- Job: ${job.title} (${job._id}) ---`);
    
    // Find all proposals for this job
    const proposals = await proposalsCollection.find({ jobId: job._id }).toArray();
    console.log(`  Proposals: ${proposals.length}`);
    
    for (const prop of proposals) {
      console.log(`    - ${prop.status}: proId=${prop.proId}`);
    }

    // Check if there's an accepted proposal
    const acceptedProposal = proposals.find(p => p.status === 'accepted');
    
    if (!acceptedProposal) {
      console.log(`  ⚠️ NO ACCEPTED PROPOSAL FOUND!`);
      
      // Check for shortlisted or other statuses
      const shortlisted = proposals.filter(p => p.status === 'shortlisted');
      const completed = proposals.filter(p => p.status === 'completed');
      
      if (completed.length > 0) {
        console.log(`  → Found ${completed.length} completed proposal(s), could update to 'accepted'`);
      } else if (shortlisted.length === 1) {
        console.log(`  → Found 1 shortlisted proposal, could update to 'accepted'`);
      } else if (shortlisted.length > 1) {
        console.log(`  → Found ${shortlisted.length} shortlisted proposals, manual review needed`);
      } else {
        console.log(`  → No clear candidate for accepted status`);
      }
    } else {
      console.log(`  ✅ Has accepted proposal: proId=${acceptedProposal.proId}`);
    }
  }

  // Summary
  console.log('\n\n=== SUMMARY ===');
  const jobsWithAccepted = [];
  const jobsWithoutAccepted = [];
  
  for (const job of inProgressJobs) {
    const hasAccepted = await proposalsCollection.findOne({ 
      jobId: job._id, 
      status: 'accepted' 
    });
    if (hasAccepted) {
      jobsWithAccepted.push(job);
    } else {
      jobsWithoutAccepted.push(job);
    }
  }
  
  console.log(`Jobs with accepted proposal: ${jobsWithAccepted.length}`);
  console.log(`Jobs WITHOUT accepted proposal: ${jobsWithoutAccepted.length}`);
  
  if (jobsWithoutAccepted.length > 0) {
    console.log('\nJobs needing fix:');
    for (const job of jobsWithoutAccepted) {
      console.log(`  - ${job._id}: ${job.title}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

fixHiredJobs().catch(console.error);
