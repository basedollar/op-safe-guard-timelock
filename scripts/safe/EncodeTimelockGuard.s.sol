// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import { Script } from "forge-std/Script.sol";
import { console2 as console } from "forge-std/console2.sol";

import { Safe } from "safe-contracts/Safe.sol";
import { Enum } from "safe-contracts/common/Enum.sol";
import { TimelockGuard } from "src/safe/TimelockGuard.sol";

/// @title EncodeTimelockGuard
/// @notice Encodes and prints calls used to operate a TimelockGuard-protected Safe.
/// @dev This script never broadcasts a transaction. The `schedule` entrypoint uses the usual
///      zero-gas Safe transaction fields. Use `scheduleWithOptions` when the transaction was
///      signed with non-default operation, gas, token, or refund fields.
contract EncodeTimelockGuard is Script {
    /// @notice Encode a call with the Safe transaction defaults used by most Safe transactions.
    function schedule(
        address _guard,
        address _safe,
        uint256 _nonce,
        address _target,
        uint256 _value,
        bytes calldata _data,
        bytes calldata _signatures
    )
        external
        pure
    {
        TimelockGuard.ExecTransactionParams memory params = _defaultParams(_target, _value, _data);
        _schedule(_guard, _safe, _nonce, params, _signatures);
    }

    /// @notice Encode a call with every Safe transaction field specified explicitly.
    function scheduleWithOptions(
        address _guard,
        address _safe,
        uint256 _nonce,
        TimelockGuard.ExecTransactionParams calldata _params,
        bytes calldata _signatures
    )
        external
        pure
    {
        _schedule(_guard, _safe, _nonce, _params, _signatures);
    }

    /// @notice Encode the Safe transaction that configures the guard.
    function configure(
        address _guard,
        uint256 _safeNonce,
        uint256 _timelockDelay,
        bytes calldata _safeSignatures
    )
        external
        pure
    {
        bytes memory guardCalldata = abi.encodeCall(TimelockGuard.configureTimelockGuard, (_timelockDelay));
        _logSafeCall(_guard, 0, guardCalldata, _safeNonce, _safeSignatures);
    }

    /// @notice Encode the Safe transaction that clears the guard configuration.
    /// @dev The Safe must disable the guard before executing this transaction.
    function clear(address _guard, uint256 _safeNonce, bytes calldata _safeSignatures) external pure {
        bytes memory guardCalldata = abi.encodeCall(TimelockGuard.clearTimelockGuard, ());
        _logSafeCall(_guard, 0, guardCalldata, _safeNonce, _safeSignatures);
    }

    /// @notice Encode a cancellation call and the Safe transaction owners must sign to authorize it.
    function cancel(
        address _guard,
        address _safe,
        bytes32 _scheduledTxHash,
        uint256 _cancellationNonce,
        bytes calldata _cancellationSignatures
    )
        external
        pure
    {
        _logCancellationSigningCall(_guard, _safe, _scheduledTxHash, _cancellationNonce, _cancellationSignatures);

        bytes memory cancelCalldata = abi.encodeCall(
            TimelockGuard.cancelTransaction,
            (Safe(payable(_safe)), _scheduledTxHash, _cancellationNonce, _cancellationSignatures)
        );

        console.log("=== Direct TimelockGuard.cancelTransaction call ===");
        _logCall(_guard, 0, cancelCalldata);
    }

    /// @notice Encode only the dummy Safe transaction whose hash owners sign for a cancellation.
    function signCancellation(
        address _guard,
        address _safe,
        bytes32 _scheduledTxHash,
        uint256 _cancellationNonce,
        bytes calldata _cancellationSignatures
    )
        external
        pure
    {
        _logCancellationSigningCall(_guard, _safe, _scheduledTxHash, _cancellationNonce, _cancellationSignatures);
    }

    function _schedule(
        address _guard,
        address _safe,
        uint256 _nonce,
        TimelockGuard.ExecTransactionParams memory _params,
        bytes memory _signatures
    )
        internal
        pure
    {
        console.log("=== Intended Safe transaction ===");
        console.log("safe:", _safe);
        _logParams(_params, _nonce, _signatures);
        console.log("Safe.execTransaction calldata (execute only after the timelock):");
        console.logBytes(_encodeSafeExec(_params, _signatures));

        bytes memory scheduleCalldata = abi.encodeCall(
            TimelockGuard.scheduleTransaction, (Safe(payable(_safe)), _nonce, _params, _signatures)
        );

        console.log("=== Direct TimelockGuard.scheduleTransaction call ===");
        _logCall(_guard, 0, scheduleCalldata);
    }

    function _logCancellationSigningCall(
        address _guard,
        address _safe,
        bytes32 _scheduledTxHash,
        uint256 _cancellationNonce,
        bytes memory _cancellationSignatures
    )
        internal
        pure
    {
        bytes memory signingData = abi.encodeCall(TimelockGuard.signCancellation, (_scheduledTxHash));
        TimelockGuard.ExecTransactionParams memory signingParams = _defaultParams(_guard, 0, signingData);

        console.log("=== Cancellation Safe transaction to sign ===");
        console.log("safe:", _safe);
        _logParams(signingParams, _cancellationNonce, _cancellationSignatures);
        console.log("Safe.execTransaction calldata (for inspection only; do not execute):");
        console.logBytes(_encodeSafeExec(signingParams, _cancellationSignatures));
    }

    function _logSafeCall(
        address _target,
        uint256 _value,
        bytes memory _data,
        uint256 _nonce,
        bytes memory _signatures
    )
        internal
        pure
    {
        TimelockGuard.ExecTransactionParams memory params = _defaultParams(_target, _value, _data);

        console.log("=== Safe transaction ===");
        _logParams(params, _nonce, _signatures);
        console.log("Safe.execTransaction calldata:");
        console.logBytes(_encodeSafeExec(params, _signatures));
    }

    function _defaultParams(address _target, uint256 _value, bytes memory _data)
        internal
        pure
        returns (TimelockGuard.ExecTransactionParams memory)
    {
        return TimelockGuard.ExecTransactionParams({
            to: _target,
            value: _value,
            data: _data,
            operation: Enum.Operation.Call,
            safeTxGas: 0,
            baseGas: 0,
            gasPrice: 0,
            gasToken: address(0),
            refundReceiver: payable(address(0))
        });
    }

    function _encodeSafeExec(TimelockGuard.ExecTransactionParams memory _params, bytes memory _signatures)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeCall(
            Safe.execTransaction,
            (
                _params.to,
                _params.value,
                _params.data,
                _params.operation,
                _params.safeTxGas,
                _params.baseGas,
                _params.gasPrice,
                _params.gasToken,
                _params.refundReceiver,
                _signatures
            )
        );
    }

    function _logParams(
        TimelockGuard.ExecTransactionParams memory _params,
        uint256 _nonce,
        bytes memory _signatures
    )
        internal
        pure
    {
        console.log("safe nonce:", _nonce);
        console.log("to:", _params.to);
        console.log("value:", _params.value);
        console.log("data:");
        console.logBytes(_params.data);
        console.log("operation:", uint256(_params.operation));
        console.log("safeTxGas:", _params.safeTxGas);
        console.log("baseGas:", _params.baseGas);
        console.log("gasPrice:", _params.gasPrice);
        console.log("gasToken:", _params.gasToken);
        console.log("refundReceiver:", _params.refundReceiver);
        console.log("signatures:");
        console.logBytes(_signatures);
    }

    function _logCall(address _target, uint256 _value, bytes memory _data) internal pure {
        console.log("target:", _target);
        console.log("value:", _value);
        console.log("data:");
        console.logBytes(_data);
    }
}
