const pify = require('pify')
const rimraf = require('rimraf')
const fs = require('fs')
const assert = require('assert')
const getGitStatus = require('./utils/get-git-status')
const getGitTags = require('./utils/get-git-tags')
const execute = require('./utils/execute')

const log = console.log
const removeDir = pify(rimraf)
const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)

const dryRun = process.argv.includes('--dry-run')
const {version} = require('./package.json')

;(async () => {
  log('Doing sanity checks...')
  const {currentBranch: branchToPublish, cleanWorkingTree} = await getGitStatus()
  if (!dryRun) {
    assert.equal(branchToPublish, 'master', 'Must be on master branch')
  }
  assert.equal(cleanWorkingTree, true, 'Must have clean working tree')
  const gitTags = await getGitTags()
  assert.ok(!gitTags.includes(`v${version}`), 'Must have a unique version in package.json')

  log('Deleting the dist folder (it will conflict with the next step)...')
  await removeDir('dist')

  log('Switching to the dist branch...')
  await execute('git checkout dist')

  log(`Merging from "${branchToPublish}" branch...`)
  await execute(`git merge ${branchToPublish}`)

  log('Running the build...')
  await execute('npm run build')

  log('Running the checks...')
  await execute('npm run check')

  if (dryRun) {
    log('Skipping publishing on npm...')
  } else {
    log('Publishing on npm...')
    await execute('npm publish')
  }

  log('Removing "dist" from .gitignore...')
  const gitignore = await readFile('.gitignore', 'utf8')
  const gitignoreWithoutDist = gitignore.split(/\r?\n/).filter(line => line !== 'dist').join('\n')
  await writeFile('.gitignore', gitignoreWithoutDist)

  log('Committing the dist dir...')
  await execute(`git add dist/ && git commit -m "Release v${version}"`)

  log('Reverting the change to .gitignore...')
  await execute('git reset --hard HEAD')

  log(`Tagging commit as "v${version}"...`)
  await execute(`git tag "v${version}"`)

  if (dryRun) {
    log('Skipping pushing to Github...')
  } else {
    log('Pushing to Github...')
    await execute('git push origin dist:dist --tags')
  }

  log(`Switching back to "${branchToPublish}" (so you can continue to work)...`)
  await execute(`git checkout "${branchToPublish}"`)

  log('OK!')
})()
