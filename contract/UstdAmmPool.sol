// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface ITRC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

contract UstdAmmPool {
    address public immutable ustdToken;
    uint256 public reserveUstd;
    uint256 public reserveTrx;
    uint256 public totalLp;

    mapping(address => uint256) public lpBalance;

    uint256 public constant FEE_NUM = 3;
    uint256 public constant FEE_DEN = 1000;

    event Swap(bool indexed isBuy, address indexed user, uint256 amountIn, uint256 amountOut, uint256 price);
    event AddLiquidity(address indexed user, uint256 ustdAmt, uint256 trxAmt, uint256 lpMint);
    event RemoveLiquidity(address indexed user, uint256 ustdAmt, uint256 trxAmt, uint256 lpBurn);

    constructor(address _ustdToken) payable {
        ustdToken = _ustdToken;
    }

    function getK() public view returns (uint256) {
        return reserveUstd * reserveTrx;
    }

    function getPrice() public view returns (uint256) {
        if (reserveUstd == 0) return 0;
        return (reserveTrx * 1e6) / reserveUstd;
    }

    // TRX -> USTD (buy USTD)
    function buyUstd() external payable {
        require(msg.value > 0, "zero trx");
        uint256 amountIn = msg.value;
        uint256 amountInAfterFee = (amountIn * (FEE_DEN - FEE_NUM)) / FEE_DEN;

        uint256 k = getK();
        uint256 newTrx = reserveTrx + amountInAfterFee;
        uint256 newUstd = k / newTrx;
        uint256 output = reserveUstd - newUstd;

        require(output > 0, "output zero");
        ITRC20(ustdToken).transfer(msg.sender, output);

        reserveTrx += amountIn;
        reserveUstd = newUstd;

        uint256 price = (amountIn * 1e6) / output;
        emit Swap(true, msg.sender, amountIn, output, price);
    }

    // USTD -> TRX (sell USTD)
    function sellUstd(uint256 ustdAmount) external {
        require(ustdAmount > 0, "zero");
        ITRC20(ustdToken).transferFrom(msg.sender, address(this), ustdAmount);

        uint256 amountInAfterFee = (ustdAmount * (FEE_DEN - FEE_NUM)) / FEE_DEN;
        uint256 k = getK();
        uint256 newUstd = reserveUstd + amountInAfterFee;
        uint256 newTrx = k / newUstd;
        uint256 output = reserveTrx - newTrx;

        require(output > 0, "output zero");
        payable(msg.sender).transfer(output);

        reserveUstd += ustdAmount;
        reserveTrx = newTrx;

        uint256 price = (output * 1e6) / ustdAmount;
        emit Swap(false, msg.sender, ustdAmount, output, price);
    }

    // Add liquidity: send TRX + approve USTD
    function addLiquidity(uint256 ustdDesired) external payable {
        require(msg.value > 0 && ustdDesired > 0, "zero input");
        ITRC20(ustdToken).transferFrom(msg.sender, address(this), ustdDesired);

        uint256 lpMint;
        if (totalLp == 0) {
            lpMint = msg.value;
        } else {
            lpMint = (totalLp * msg.value) / reserveTrx;
        }
        lpBalance[msg.sender] += lpMint;
        totalLp += lpMint;

        reserveTrx += msg.value;
        reserveUstd += ustdDesired;

        emit AddLiquidity(msg.sender, ustdDesired, msg.value, lpMint);
    }

    // Remove liquidity
    function removeLiquidity(uint256 lpBurn) external {
        require(lpBalance[msg.sender] >= lpBurn, "insufficient lp");
        uint256 trxOut = (reserveTrx * lpBurn) / totalLp;
        uint256 ustdOut = (reserveUstd * lpBurn) / totalLp;

        lpBalance[msg.sender] -= lpBurn;
        totalLp -= lpBurn;

        reserveTrx -= trxOut;
        reserveUstd -= ustdOut;

        payable(msg.sender).transfer(trxOut);
        ITRC20(ustdToken).transfer(msg.sender, ustdOut);

        emit RemoveLiquidity(msg.sender, ustdOut, trxOut, lpBurn);
    }

    receive() external payable {}
}
