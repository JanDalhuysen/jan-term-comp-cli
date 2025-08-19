# Collaborative Testing Tool

This tool facilitates collaborative testing of competitive programming solutions. It allows multiple users to run their programs against the same set of test cases and compares their outputs to find discrepancies.

## How It Works

The tool operates in a client-server model where one user acts as the **host** and others are **participants**.

1.  **Setup**: All users (host and participants) connect to the same room on the server.
2.  **Host's Role**: The host provides a script that generates test case inputs. When the host starts the test run, this script is executed to create the first test case.
3.  **Test Case Distribution**: The generated test case input is sent to the server, which then broadcasts it to all connected participants in the room.
4.  **Program Execution**: Upon receiving a test case, each user's local program is executed with the provided input. The output of the program is then sent back to the server.
5.  **Output Comparison**: The server gathers the outputs from all users and compares them.
    *   **Match**: If all outputs are identical, the host is prompted to generate the next test case, and the cycle continues.
    *   **Mismatch**: If any of the outputs differ, the server identifies the discrepancies and sends a detailed "diff" report to all users. The session then terminates.

This process allows for efficient and synchronized testing, quickly identifying the exact input that causes different program behaviors.

## Usage

To use the tool, you need to run the `client.js` script from your terminal with the appropriate command-line arguments.

### Arguments

*   `--program`: **(Required)** The path to your executable program that you want to test.
*   `--room`: **(Required)** The ID of the room you want to join. All users who want to test together must use the same room ID.
*   `--script`: (Host only) The path to a script that generates test case inputs. This is required for the host user. The script should be an executable that prints the test case to standard output.
*   `--server`: The URL of the testing server. Defaults to `http://129.151.168.7`.
*   `--count`: The number of test cases to run before exiting (if no mismatches are found). Defaults to `10`.

### Examples

**Host:**

```bash
node client.js --program ./my_solution.exe --room my-testing-room --script ./generate_test_case.sh
```

**Participant:**

```bash
node client.js --program ./my_solution.exe --room my-testing-room
```

## Dependencies

This tool requires Node.js and the following npm packages:

*   `socket.io-client`
*   `yargs`
*   `chalk`

You can install these dependencies by running:

```bash
npm install
```
