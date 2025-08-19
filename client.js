#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {exec, spawn} = require('child_process');
const io = require('socket.io-client');
const os = require('os');

let runs_count = 10;

async function run()
{
    const {default : chalk} = await import('chalk');
    const {default : yargs} = await import('yargs/yargs');
    const {hideBin} = await import('yargs/helpers');
    // --- Argument Parsing ---
    const argv = yargs(hideBin(process.argv))
                     .option('script', {
                         type : 'string',
                         description : 'Path to the test case generator script (for host).',
                     })
                     .option('program', {
                         type : 'string',
                         demandOption : true,
                         description : 'Path to the executable program to test.',
                     })
                     .option('room', {
                         type : 'string',
                         demandOption : true,
                         description : 'The room ID to join.',
                     })
                     .option('server', {
                         type : 'string',
                         default : 'http://129.151.168.7',
                         description : 'The server URL.',
                     })
                     .option('count', {
                         type : 'number',
                         default : 10,
                         description : 'Number of diffs to run.',
                     })
                     .help()
                     .argv;

    // --- Helper Functions ---

    /**
     * Executes a command and returns its standard output.
     * @param {string} command - The command to execute.
     * @returns {Promise<string>} - A promise that resolves with the stdout.
     */
    function runCommand(command)
    {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error)
                {
                    reject(new Error(`Execution Error: ${stderr || error.message}`));
                    return;
                }
                resolve(stdout);
            });
        });
    }

    /**
     * Runs the user's program with the given input.
     * @param {string} programPath - Path to the user's executable.
     * @param {string} input - The test case input.
     * @returns {Promise<string>} - A promise that resolves with the program's stdout.
     */
    function runProgramWithInput(programPath, input)
    {
        return new Promise((resolve, reject) => {
            // Create a temporary file for the input
            const tempInputPath = path.join(process.cwd(), `test-input.txt`);
            fs.writeFileSync(tempInputPath, input);

            const program = spawn(programPath, [ tempInputPath ]);
            let stdout = '';
            let stderr = '';

            program.stdout.on('data', (data) => { stdout += data.toString(); });
            program.stderr.on('data', (data) => { stdout += data.toString(); }); // stderr -> stdout

            program.on('close', (code) => {
                fs.unlinkSync(tempInputPath); // Clean up temp file
                // if (code !== 0)
                // {
                //     reject(new Error(`Program exited with code ${code}:\n${stderr}`));
                // }
                // else
                // {
                resolve(stdout);
                // }
            });

            program.on('error', (err) => {
                fs.unlinkSync(tempInputPath);
                reject(new Error(`Failed to start program: ${err.message}`));
            });
        });
    }

    // --- Main Application Logic ---
    const {server, room, script, program, count} = argv;
    runs_count = count;
    const socket = io(server);

    console.log(chalk.blue(`Attempting to connect to server at ${server}...`));

    socket.on('connect', () => {
        console.log(chalk.green(`Connected to server with ID: ${socket.id}`));
        socket.emit('setup_room', {roomId : room, hasScript : !!script});
    });

    socket.on('setup_success', ({isHost}) => {
        console.log(chalk.green.bold(`Successfully joined room '${room}'.`));
        if (isHost)
        {
            console.log(chalk.yellow('You are the host.'));
            console.log(chalk.cyan('Press ENTER to start the test run when all users have joined.'));
            // Listen for the Enter key
            process.stdin.on('data', () => {
                socket.emit('start_testing', {roomId : room});
                console.log(chalk.magenta('Test run started. Generating first test case...'));
                process.stdin.pause(); // Stop listening for input
            });
        }
        else
        {
            console.log(chalk.yellow('You are a participant. Waiting for the host to start the test run...'));
        }
    });

    socket.on('user_update',
              ({members}) => { console.log(chalk.gray(`There are now ${members} user(s) in the room.`)); });

    socket.on('generate_test_case', async () => {
        try
        {
            const input = await runCommand(script);
            socket.emit('submit_input', {roomId : room, input});
        }
        catch (error)
        {
            console.error(chalk.red(`Failed to generate test case: ${error.message}`));
            socket.emit('error_occurred', {message : 'Host failed to generate a test case.'});
        }
    });

    socket.on('run_program', async ({input}) => {
        console.log(chalk.blue('Received new test case. Running program...'));
        try
        {
            const output = await runProgramWithInput(program, input);
            socket.emit('submit_output', {roomId : room, output});
            console.log(chalk.green('Program finished. Sent output to server.'));
        }
        catch (error)
        {
            console.error(chalk.red(`Failed to run program: ${error.message}`));
            socket.emit('error_occurred', {message : `User ${socket.id.substring(0, 4)}'s program failed.`});
        }
    });

    socket.on('all_match', () => {
        console.log(chalk.green.bold('\nOutputs match!'));
        console.log(chalk.magenta('--------------------------------------'));
        if (runs_count == 0) {
            process.exit(0);
        } else {
            runs_count--;
        }
        console.log(chalk.blue('Waiting for next test case from host...'));
    });

    socket.on('diff_found', ({input, diffs}) => {
        console.log(chalk.red.bold('\n--- MISMATCH FOUND! ---'));
        console.log(chalk.yellow.bold('\nFailing Test Case Input:'));
        console.log(chalk.white(input));
        console.log(chalk.yellow.bold('\nPairwise Diffs:'));

        diffs.forEach(({users, patch}) => {
            console.log(chalk.cyan.bold(`\n--- Diff between user ${users[0]} and user ${users[1]} ---`));
            patch.split('\n').forEach(line => {
                if (line.startsWith('+') && !line.startsWith('+++'))
                    console.log(chalk.green(line));
                else if (line.startsWith('-') && !line.startsWith('---'))
                    console.log(chalk.red(line));
                else if (line.startsWith('@@'))
                    console.log(chalk.cyan(line));
                else
                    console.log(line);
            });
        });

        console.log(chalk.red.bold('\n--- END OF SESSION ---'));
        socket.disconnect();
        process.exit(0);
    });

    socket.on('error_occurred', ({message}) => {
        console.error(chalk.red.bold(`\nAn error occurred: ${message}`));
        socket.disconnect();
        process.exit(1);
    });

    socket.on('disconnect', () => { console.log(chalk.gray('Disconnected from server.')); });
}

run();
