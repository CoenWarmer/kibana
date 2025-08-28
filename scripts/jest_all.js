/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

var childProcess = require('child_process');
var path = require('path');
var os = require('os');
var fs = require('fs');

var ROOT_DIR = path.resolve(__dirname, '..');

function run(cmd, args, opts) {
  if (!opts) opts = {};
  return new Promise(function (resolvePromise) {
    var cp = childProcess.spawn(cmd, args, {
      stdio: opts.stdio ? opts.stdio : 'pipe',
      cwd: opts.cwd ? opts.cwd : ROOT_DIR,
      env: opts.env ? opts.env : process.env,
      shell: false,
    });
    var stdout = '';
    var stderr = '';
    if (cp.stdout)
      cp.stdout.on('data', function (d) {
        stdout += String(d);
      });
    if (cp.stderr)
      cp.stderr.on('data', function (d) {
        stderr += String(d);
      });
    cp.on('close', function (code) {
      resolvePromise({ code: code, stdout: stdout, stderr: stderr });
    });
  });
}

function discoverConfigs() {
  // Prefer git to avoid scanning node_modules
  return new Promise(function (resolvePromise) {
    run('git', ['ls-files', '**/jest.config.js', '**/jest.integration.config.js'], {
      stdio: 'pipe',
    })
      .then(function (res) {
        if (res.code === 0) {
          var lines = res.stdout.split(/\r?\n/);
          var out = [];
          for (var i = 0; i < lines.length; i++) {
            var l = lines[i].trim();
            if (l) out.push(l);
          }
          out.sort();
          resolvePromise(out);
          return;
        }
        // fallback
        return run('bash', [
          '-lc',
          "find . -type f \\ ( -name 'jest.config.js' -o -name 'jest.integration.config.js' \\ ) | sort",
        ]).then(function (res2) {
          var lines2 = res2.stdout.split(/\r?\n/);
          var out2 = [];
          for (var j = 0; j < lines2.length; j++) {
            var l2 = lines2[j].replace(/^\.\//, '').trim();
            if (l2) out2.push(l2);
          }
          out2.sort();
          resolvePromise(out2);
        });
      })
      .catch(function () {
        run('bash', [
          '-lc',
          "find . -type f \\ ( -name 'jest.config.js' -o -name 'jest.integration.config.js' \\ ) | sort",
        ]).then(function (res2) {
          var lines2 = res2.stdout.split(/\r?\n/);
          var out2 = [];
          for (var j = 0; j < lines2.length; j++) {
            var l2 = lines2[j].replace(/^\.\//, '').trim();
            if (l2) out2.push(l2);
          }
          out2.sort();
          resolvePromise(out2);
        });
      });
  });
}

function runJestConfig(configPath, workers) {
  return new Promise(function (resolvePromise) {
    var effectiveWorkers = 0;
    if (workers && workers > 0) {
      effectiveWorkers = workers;
    } else if (process.env.JEST_MAX_WORKERS) {
      var envWorkers = parseInt(process.env.JEST_MAX_WORKERS, 10);
      if (!isNaN(envWorkers) && envWorkers > 0) effectiveWorkers = envWorkers;
    } else if (os.cpus && typeof os.cpus === 'function') {
      try {
        var count = os.cpus().length;
        if (count && count > 0) effectiveWorkers = count;
      } catch (e) {
        effectiveWorkers = 4;
      }
    }
    if (!effectiveWorkers) effectiveWorkers = 4;

    var args = [
      'scripts/jest',
      '--config',
      configPath,
      '--passWithNoTests',
      '--maxWorkers',
      String(effectiveWorkers),
    ];
    var nodeOptions =
      (process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS : '') + ' --max-old-space-size=8192';
    var env = Object.assign({}, process.env, { NODE_OPTIONS: nodeOptions.trim() });
    var start = Date.now();
    console.log('--- $ node ' + args.join(' '));
    var cp = childProcess.spawn('node', args, { stdio: 'inherit', cwd: ROOT_DIR, env: env });
    cp.on('close', function (code) {
      var elapsed = Math.floor((Date.now() - start) / 1000);
      var duration =
        elapsed > 60 ? Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's' : elapsed + 's';
      resolvePromise({ code: code, duration: duration });
    });
  });
}

function main() {
  var listOnly = false;
  var cliWorkers = null;
  var cliScope = null;
  for (var i = 2; i < process.argv.length; i++) {
    var arg = process.argv[i];
    if (arg === '--list') listOnly = true;
    if (arg.indexOf('--workers') === 0) {
      var v = null;
      if (arg.indexOf('=') > -1) {
        v = arg.split('=')[1];
      } else if (process.argv[i + 1] && process.argv[i + 1].charAt(0) !== '-') {
        v = process.argv[i + 1];
        i++;
      }
      if (v) {
        var parsed = parseInt(v, 10);
        if (!isNaN(parsed) && parsed > 0) cliWorkers = parsed;
      }
    }
    if (arg.indexOf('--path') === 0 || arg.indexOf('--scope') === 0) {
      var pv = null;
      if (arg.indexOf('=') > -1) {
        pv = arg.split('=')[1];
      } else if (process.argv[i + 1] && process.argv[i + 1].charAt(0) !== '-') {
        pv = process.argv[i + 1];
        i++;
      }
      if (pv) cliScope = pv;
    }
  }

  discoverConfigs()
    .then(function (configs) {
      if (!configs || configs.length === 0) {
        console.error('No Jest config files found.');
        process.exit(1);
      }

      var scope = cliScope || '';
      if (scope) {
        var absScope = path.resolve(ROOT_DIR, scope);
        var isDir = false;
        try {
          var st = fs.statSync(absScope);
          isDir = st.isDirectory();
        } catch (e) {
          // if path doesn't exist, treat as directory-like prefix
          isDir = true;
        }
        var filtered = [];
        for (var ci = 0; ci < configs.length; ci++) {
          var cfg = configs[ci];
          var absCfg = path.resolve(ROOT_DIR, cfg);
          if (isDir) {
            var rel = path.relative(absScope, absCfg);
            if (rel === '' || rel === '.' || rel.indexOf('..') !== 0) {
              filtered.push(cfg);
            }
          } else {
            if (absCfg === absScope) filtered.push(cfg);
          }
        }
        configs = filtered;
        console.log('--- Applying scope:', scope);
      }

      console.log('--- Discovering Jest configs...');
      console.log('Found the following configs (' + configs.length + '):');
      console.log(configs.join('\n'));

      if (listOnly) return;

      var exitCode = 0;
      var results = [];

      console.log();
      var previewWorkers = 4;
      if (cliWorkers) {
        previewWorkers = cliWorkers;
      } else if (process.env.JEST_MAX_WORKERS) {
        var envW = parseInt(process.env.JEST_MAX_WORKERS, 10);
        if (!isNaN(envW) && envW > 0) previewWorkers = envW;
      } else if (os.cpus && typeof os.cpus === 'function') {
        try {
          var cnt = os.cpus().length;
          if (cnt && cnt > 0) previewWorkers = cnt;
        } catch (e) {
          previewWorkers = 4;
        }
      }
      console.log(
        '--- Running Jest for each config (sequential, maxWorkers=' + previewWorkers + ')'
      );

      // Run sequentially using a simple promise chain
      var total = configs.length;
      var completed = 0;
      var p = Promise.resolve();
      var addRun = function (config, idx) {
        p = p.then(function () {
          var pctStart = Math.floor(((idx + 1) / total) * 100);
          console.log('[' + (idx + 1) + '/' + total + ' ' + pctStart + '%] ' + config);
          var chosenWorkers = null;
          if (cliWorkers) {
            chosenWorkers = cliWorkers;
          } else if (process.env.JEST_MAX_WORKERS) {
            var envChosen = parseInt(process.env.JEST_MAX_WORKERS, 10);
            if (!isNaN(envChosen) && envChosen > 0) chosenWorkers = envChosen;
          }
          return runJestConfig(config, chosenWorkers).then(function (res) {
            completed += 1;
            var pctDone = Math.floor((completed / total) * 100);
            console.log(
              'Done [' +
                completed +
                '/' +
                total +
                ' ' +
                pctDone +
                '%] ' +
                config +
                ' in ' +
                res.duration +
                ' (code ' +
                res.code +
                ')'
            );
            results.push(
              '- ' + config + '\n    duration: ' + res.duration + '\n    result: ' + res.code
            );
            if (res.code !== 0) {
              exitCode = res.code;
              console.log('Jest for ' + config + ' exited with code ' + res.code);
              console.log('^^^ +++');
            }
          });
        });
      };
      for (var k = 0; k < configs.length; k++) addRun(configs[k], k);

      p.then(function () {
        console.log();
        console.log('--- Summary');
        console.log(results.join('\n'));
        process.exit(exitCode);
      }).catch(function (err) {
        console.error((err && err.stack) || String(err));
        process.exit(1);
      });
    })
    .catch(function (err) {
      console.error((err && err.stack) || String(err));
      process.exit(1);
    });
}

main();
